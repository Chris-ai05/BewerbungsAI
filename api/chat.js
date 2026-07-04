// =============================================================================
// api/chat.js — Serverless-Funktion (läuft auf Vercel, NICHT im Browser)
//
// Aufgabe: Nimmt Chat-Nachrichten vom Frontend entgegen, ergänzt Systemprompt
// und Wissensdatei und ruft damit die Anthropic API auf. Der API-Key bleibt
// dadurch ausschließlich auf dem Server (Umgebungsvariable ANTHROPIC_API_KEY).
//
// Was Sie hier ggf. anpassen möchten, steht gesammelt unter "KONFIGURATION".
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ----------------------------- KONFIGURATION --------------------------------

// Modellwahl: "claude-sonnet-5" liefert hochwertige, gut formulierte Antworten.
// Günstigere Alternative für hohes Aufkommen: "claude-haiku-4-5".
// Kann ohne Code-Änderung über die Vercel-Umgebungsvariable ANTHROPIC_MODEL
// überschrieben werden.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// Maximale Länge einer Antwort (in Tokens). Begrenzt Kosten und hält
// Antworten angenehm kompakt.
const MAX_OUTPUT_TOKENS = 800;

// Wie viele Nachrichten des bisherigen Gesprächs mitgeschickt werden.
// Ältere Nachrichten werden abgeschnitten (Kosten- und Missbrauchsschutz).
const MAX_VERLAUF = 12;

// Maximale Zeichenlänge einer einzelnen Nutzernachricht.
const MAX_NACHRICHT_ZEICHEN = 2000;

// Einfaches Rate-Limit pro IP-Adresse: max. Anfragen pro Zeitfenster.
// Hinweis: Dies ist ein Best-Effort-Schutz (siehe README, Abschnitt Sicherheit).
const RATE_LIMIT_FENSTER_MS = 60_000; // 1 Minute
const RATE_LIMIT_MAX = 8;

// -----------------------------------------------------------------------------

// Systemprompt + Wissensdatei werden einmal pro Funktionsinstanz eingelesen
// und dann wiederverwendet (schneller, günstiger).
let systemPromptCache = null;

function ladeSystemPrompt() {
  if (systemPromptCache) return systemPromptCache;

  // Kandidaten-Pfade: Vercel bündelt die Dateien dank "includeFiles" in
  // vercel.json in das Funktionsverzeichnis; lokal liegt "data/" im Projekt.
  const kandidaten = [
    path.join(process.cwd(), "data"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data"),
  ];

  let datenOrdner = null;
  for (const p of kandidaten) {
    if (fs.existsSync(path.join(p, "systemprompt.md"))) {
      datenOrdner = p;
      break;
    }
  }
  if (!datenOrdner) {
    throw new Error(
      "data/systemprompt.md bzw. data/wissensdatei.md wurden nicht gefunden. " +
        "Bitte prüfen, ob der Ordner 'data' im Repository liegt und vercel.json unverändert ist."
    );
  }

  const systemprompt = fs.readFileSync(path.join(datenOrdner, "systemprompt.md"), "utf-8");
  const wissen = fs.readFileSync(path.join(datenOrdner, "wissensdatei.md"), "utf-8");

  // Wissensdatei klar abgegrenzt an den Systemprompt anhängen. Auf diese
  // XML-Tags kann sich der Systemprompt beziehen ("die Wissensdatei").
  systemPromptCache =
    `${systemprompt.trim()}\n\n` +
    `<wissensdatei>\n${wissen.trim()}\n</wissensdatei>`;

  return systemPromptCache;
}

// ----------------------------- Rate-Limiting --------------------------------

const anfragenProIp = new Map(); // ip -> Array von Zeitstempeln

function istRateLimited(ip) {
  const jetzt = Date.now();
  const bisher = (anfragenProIp.get(ip) || []).filter(
    (t) => jetzt - t < RATE_LIMIT_FENSTER_MS
  );
  if (bisher.length >= RATE_LIMIT_MAX) {
    anfragenProIp.set(ip, bisher);
    return true;
  }
  bisher.push(jetzt);
  anfragenProIp.set(ip, bisher);

  // Speicher sauber halten, falls viele verschiedene IPs anfragen.
  if (anfragenProIp.size > 5000) anfragenProIp.clear();
  return false;
}

// ------------------------- Eingabe-Validierung ------------------------------

function bereinigeVerlauf(eingabe) {
  if (!Array.isArray(eingabe)) return null;

  const nachrichten = eingabe
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_NACHRICHT_ZEICHEN),
    }))
    .slice(-MAX_VERLAUF);

  if (nachrichten.length === 0) return null;

  // Aufeinanderfolgende Nachrichten derselben Rolle zusammenführen und
  // sicherstellen, dass das Gespräch mit einer Nutzernachricht beginnt/endet
  // (Anforderung der Anthropic API).
  const zusammengefuehrt = [];
  for (const m of nachrichten) {
    const letzte = zusammengefuehrt[zusammengefuehrt.length - 1];
    if (letzte && letzte.role === m.role) {
      letzte.content += `\n${m.content}`;
    } else {
      zusammengefuehrt.push({ ...m });
    }
  }
  while (zusammengefuehrt.length > 0 && zusammengefuehrt[0].role !== "user") {
    zusammengefuehrt.shift();
  }
  if (
    zusammengefuehrt.length === 0 ||
    zusammengefuehrt[zusammengefuehrt.length - 1].role !== "user"
  ) {
    return null;
  }
  return zusammengefuehrt;
}

// ------------------------------- Handler -------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Nur POST-Anfragen sind erlaubt." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY ist nicht gesetzt (Vercel > Settings > Environment Variables).");
    return res.status(500).json({
      error: "Der Assistent ist derzeit nicht konfiguriert. Bitte versuchen Sie es später erneut.",
    });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unbekannt";

  if (istRateLimited(ip)) {
    return res.status(429).json({
      error:
        "Sie haben in kurzer Zeit viele Anfragen gestellt. Bitte warten Sie einen Moment und versuchen Sie es dann erneut.",
    });
  }

  const nachrichten = bereinigeVerlauf(req.body?.messages);
  if (!nachrichten) {
    return res.status(400).json({ error: "Ungültige Anfrage." });
  }

  let systemPrompt;
  try {
    systemPrompt = ladeSystemPrompt();
  } catch (fehler) {
    console.error(fehler);
    return res.status(500).json({
      error: "Der Assistent ist derzeit nicht konfiguriert. Bitte versuchen Sie es später erneut.",
    });
  }

  try {
    const client = new Anthropic(); // liest ANTHROPIC_API_KEY automatisch

    const antwort = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: nachrichten,
    });

    const text = antwort.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return res.status(502).json({
        error: "Es konnte keine Antwort erzeugt werden. Bitte formulieren Sie Ihre Frage anders.",
      });
    }

    return res.status(200).json({ reply: text });
  } catch (fehler) {
    console.error("Anthropic-API-Fehler:", fehler?.status, fehler?.message);

    if (fehler?.status === 429 || fehler?.status === 529) {
      return res.status(503).json({
        error: "Der Assistent ist gerade stark ausgelastet. Bitte versuchen Sie es in Kürze erneut.",
      });
    }
    if (fehler?.status === 401) {
      return res.status(500).json({
        error: "Der Assistent ist derzeit nicht konfiguriert. Bitte versuchen Sie es später erneut.",
      });
    }
    return res.status(500).json({
      error: "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.",
    });
  }
}

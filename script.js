// =============================================================================
// script.js — Chat-Logik im Browser
//
// Sendet die Unterhaltung an die eigene Serverless-Funktion (/api/chat).
// Der Anthropic-API-Key kommt hier bewusst NICHT vor — er bleibt auf dem Server.
// =============================================================================

(function () {
  "use strict";

  const verlaufElement = document.getElementById("chatVerlauf");
  const formular = document.getElementById("chatFormular");
  const textfeld = document.getElementById("chatText");
  const sendeKnopf = document.getElementById("chatSenden");
  const vorschlaege = document.getElementById("chatVorschlaege");

  if (!verlaufElement || !formular || !textfeld || !sendeKnopf) return;

  // Gesprächsverlauf im Format der Anthropic API: { role, content }
  const verlauf = [];

  // Wie viele Nachrichten maximal an den Server geschickt werden
  // (der Server kürzt zusätzlich — siehe api/chat.js).
  const MAX_VERLAUF = 12;

  let wartetAufAntwort = false;

  // --------------------------- Darstellung ----------------------------------

  function zeigeNachricht(text, klasse) {
    const element = document.createElement("div");
    element.className = "nachricht " + klasse;
    element.textContent = text; // textContent schützt vor HTML-Einschleusung
    verlaufElement.appendChild(element);
    scrolleNachUnten();
    return element;
  }

  function zeigeTippIndikator() {
    const element = document.createElement("div");
    element.className = "tippt";
    element.setAttribute("aria-label", "Der Assistent schreibt");
    element.innerHTML = "<span></span><span></span><span></span>";
    verlaufElement.appendChild(element);
    scrolleNachUnten();
    return element;
  }

  function scrolleNachUnten() {
    verlaufElement.scrollTop = verlaufElement.scrollHeight;
  }

  function setzeEingabeStatus(gesperrt) {
    wartetAufAntwort = gesperrt;
    textfeld.disabled = gesperrt;
    sendeKnopf.disabled = gesperrt;
  }

  // ----------------------------- Senden -------------------------------------

  async function sende(frage) {
    const text = frage.trim();
    if (!text || wartetAufAntwort) return;

    // Vorschlagsfragen nach der ersten Nachricht ausblenden
    if (vorschlaege) vorschlaege.style.display = "none";

    zeigeNachricht(text, "nutzer");
    verlauf.push({ role: "user", content: text });

    textfeld.value = "";
    passeHoeheAn();
    setzeEingabeStatus(true);
    const indikator = zeigeTippIndikator();

    try {
      const antwort = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: verlauf.slice(-MAX_VERLAUF) }),
      });

      const daten = await antwort.json().catch(() => ({}));

      if (!antwort.ok) {
        throw new Error(
          daten.error ||
            "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut."
        );
      }

      verlauf.push({ role: "assistant", content: daten.reply });
      indikator.remove();
      zeigeNachricht(daten.reply, "assistent");
    } catch (fehler) {
      // Fehlgeschlagene Nutzernachricht aus dem Verlauf entfernen,
      // damit ein erneuter Versuch sauber funktioniert.
      if (verlauf[verlauf.length - 1]?.role === "user") verlauf.pop();

      indikator.remove();
      const meldung =
        fehler instanceof TypeError
          ? "Der Assistent ist gerade nicht erreichbar. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut."
          : fehler.message;
      zeigeNachricht(meldung, "fehler");
    } finally {
      setzeEingabeStatus(false);
      textfeld.focus();
    }
  }

  // --------------------------- Interaktion ----------------------------------

  formular.addEventListener("submit", function (ereignis) {
    ereignis.preventDefault();
    sende(textfeld.value);
  });

  // Enter sendet, Umschalt+Enter erzeugt einen Zeilenumbruch
  textfeld.addEventListener("keydown", function (ereignis) {
    if (ereignis.key === "Enter" && !ereignis.shiftKey) {
      ereignis.preventDefault();
      sende(textfeld.value);
    }
  });

  // Textfeld wächst mit dem Inhalt
  function passeHoeheAn() {
    textfeld.style.height = "auto";
    textfeld.style.height = textfeld.scrollHeight + "px";
  }
  textfeld.addEventListener("input", passeHoeheAn);

  // Vorschlagsfragen anklickbar machen
  if (vorschlaege) {
    vorschlaege.addEventListener("click", function (ereignis) {
      const knopf = ereignis.target.closest("button");
      if (knopf) sende(knopf.textContent);
    });
  }
})();

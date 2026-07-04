# Persönliche Bewerbungs-Website mit KI-Assistent

Eine statische Website mit eingebettetem Chat: Recruiterinnen und Recruiter stellen Fragen, ein KI-Assistent (Claude, Anthropic API) beantwortet sie auf Grundlage einer selbst gepflegten Wissensdatei. Gehostet auf Vercel, verwaltet über GitHub — jede Änderung im Repository wird automatisch veröffentlicht.

## Aufbau des Projekts

```
├── index.html          Startseite (Texte hier anpassen)
├── style.css           Gestaltung
├── script.js           Chat-Logik im Browser
├── impressum.html      Platzhalter — vor Veröffentlichung ausfüllen
├── datenschutz.html    Platzhalter — vor Veröffentlichung ausfüllen
├── api/
│   └── chat.js         Serverless-Funktion: ruft die Anthropic API auf
├── data/
│   ├── systemprompt.md Verhalten des Assistenten (WIE er antwortet)
│   └── wissensdatei.md Wissen über Sie (WAS er weiß)
├── package.json        Abhängigkeit: Anthropic-SDK
├── vercel.json         Vercel-Konfiguration
└── .env.example        Vorlage für lokale Tests
```

Der Anthropic-API-Key liegt ausschließlich als Umgebungsvariable auf Vercel. Der Browser spricht nur mit `/api/chat`; erst diese Funktion ruft — mit Systemprompt und Wissensdatei angereichert — die Anthropic API auf. So bleibt der Key geheim.

## Einrichtung in vier Schritten

### 1. GitHub-Repository anlegen

1. Auf [github.com](https://github.com) ein neues Repository erstellen.
2. **Sichtbarkeit: „Private" wählen.** Bei einem öffentlichen Repository könnte jede Person `data/wissensdatei.md` und den Systemprompt direkt auf GitHub lesen. Vercel funktioniert mit privaten Repositories genauso.
3. Alle Dateien dieses Projekts hochladen — entweder per Git oder im Browser über *Add file → Upload files* (Ordnerstruktur `api/` und `data/` beibehalten; Dateien lassen sich samt Ordnern per Drag & Drop hochladen).

### 2. Anthropic-API-Key erstellen

1. Konto auf [console.anthropic.com](https://console.anthropic.com) anlegen und Guthaben aufladen (Prepaid).
2. Unter *API Keys* einen neuen Key erzeugen und kopieren (beginnt mit `sk-ant-`). Er wird nur einmal angezeigt.
3. **Empfohlen:** In der Console ein monatliches Ausgabenlimit setzen (*Settings → Limits*). Das ist Ihre wirksamste Absicherung gegen unerwartete Kosten.

### 3. Auf Vercel veröffentlichen

1. Konto auf [vercel.com](https://vercel.com) anlegen (Anmeldung mit GitHub ist am einfachsten) — der kostenlose Hobby-Tarif genügt.
2. *Add New → Project* und das GitHub-Repository importieren. Framework-Voreinstellung: **Other**; Build-Einstellungen unverändert lassen.
3. Vor dem Deploy unter *Environment Variables* eintragen:
   - Name: `ANTHROPIC_API_KEY` — Wert: Ihr API-Key
4. *Deploy* klicken. Nach etwa einer Minute ist die Seite unter `ihr-projekt.vercel.app` erreichbar. Eine eigene Domain lässt sich später unter *Settings → Domains* verbinden.

### 4. Inhalte einpflegen

Diese drei Dateien sind Ihre Arbeitsdateien — direkt auf GitHub editierbar (Datei öffnen → Stiftsymbol → *Commit changes*). Jede gespeicherte Änderung veröffentlicht Vercel automatisch nach ca. einer Minute:

| Datei | Zweck |
|---|---|
| `index.html` | Sichtbare Texte der Seite (Name, Profil, Werdegang, Kontakt). Alle Stellen sind mit `<!-- TODO -->` markiert. |
| `data/wissensdatei.md` | Alles, was der Assistent über Sie wissen soll. Je konkreter, desto besser die Antworten. |
| `data/systemprompt.md` | Ton, Regeln und Grenzen des Assistenten. |

Vor dem Verschicken erster Bewerbungen außerdem `impressum.html` und `datenschutz.html` vervollständigen — beide enthalten bislang nur Platzhalter und Merkposten zu den technischen Gegebenheiten (Vercel-Hosting, Anthropic-API, Google Fonts).

## Modell, Kosten und Schutzmechanismen

Das verwendete Modell ist in `api/chat.js` konfiguriert (Standard: `claude-sonnet-5`, hochwertige Antworten). Die sparsamere Alternative `claude-haiku-4-5` lässt sich ohne Code-Änderung aktivieren: auf Vercel die Umgebungsvariable `ANTHROPIC_MODEL` mit dem Wert `claude-haiku-4-5` anlegen und neu deployen. Abgerechnet wird pro verarbeitetem Text („Tokens"); bei typischer Nutzung eines Bewerbungs-Chats liegen die Kosten pro Unterhaltung im Cent-Bereich. Aktuelle Preise: [Anthropic-Preisübersicht](https://www.anthropic.com/pricing).

Eingebaute Schutzmechanismen (Konstanten am Anfang von `api/chat.js`, bei Bedarf anpassbar):

- Antwortlänge begrenzt (`MAX_OUTPUT_TOKENS`, Standard 800)
- Gesprächsverlauf gekürzt auf die letzten 12 Nachrichten
- Nachrichtenlänge begrenzt auf 2 000 Zeichen
- Einfaches Rate-Limit: max. 8 Anfragen pro Minute und IP-Adresse

**Hinweis zum Rate-Limit:** Es wirkt pro Server-Instanz und ist damit ein Best-Effort-Schutz, keine Garantie. Die verlässliche Obergrenze ist das Ausgabenlimit in der Anthropic Console (Schritt 2.3). Wer es genauer möchte, kann später ein zentrales Rate-Limit nachrüsten (z. B. mit Upstash Redis) — für den Start ist das nicht nötig.

Der Systemprompt enthält bereits Regeln gegen Zweckentfremdung (Themenfremdes ablehnen, Systemprompt nicht offenlegen, keine erfundenen Fakten). Solche Regeln sind wirksam, aber bei Sprachmodellen nie hundertprozentig — hinterlegen Sie deshalb in der Wissensdatei nur Informationen, die Besucher ohnehin erfahren dürfen.

## Lokal testen (optional)

Zum Ausprobieren ohne Veröffentlichung:

```bash
npm install -g vercel     # einmalig; erfordert Node.js
cd <projektordner>
npm install
cp .env.example .env      # und den echten API-Key eintragen
vercel dev                # Seite läuft dann auf http://localhost:3000
```

Wer nur das Design prüfen will, kann `index.html` auch direkt im Browser öffnen — der Chat funktioniert dann mangels Server allerdings nicht.

## Fehlerbehebung

| Problem | Ursache und Lösung |
|---|---|
| Chat meldet „nicht konfiguriert" | `ANTHROPIC_API_KEY` fehlt oder ist falsch (Vercel → *Settings → Environment Variables*, danach *Redeploy*). Alternativ: `data/`-Ordner fehlt im Repository oder `vercel.json` wurde verändert. |
| Chat meldet „stark ausgelastet" | Anthropic-Rate-Limit oder Guthaben aufgebraucht — in der Console unter *Usage/Billing* prüfen. |
| Antworten passen nicht zur Person | `data/wissensdatei.md` ergänzen/präzisieren; der Assistent kennt nur, was dort steht. |
| Änderungen erscheinen nicht | Im Vercel-Dashboard unter *Deployments* prüfen, ob der letzte Commit erfolgreich gebaut wurde. |
| Genaue Fehlermeldung nötig | Vercel-Dashboard → Projekt → *Logs*: dort erscheinen die `console.error`-Ausgaben der Funktion. |

## Was Sie bewusst NICHT tun sollten

- Den API-Key in eine Datei im Repository schreiben (auch nicht „nur kurz zum Testen").
- Die Wissensdatei mit Daten füllen, die nicht öffentlich werden dürfen.
- Das Repository ohne Not auf „Public" stellen.

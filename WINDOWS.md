# Stimmraum unter Windows auf localhost

## Voraussetzungen

- Windows 10 oder 11, aktueller Edge oder Chrome.
- **Node.js 24 LTS** inklusive npm: [offizieller Download](https://nodejs.org/en/download). Nach der Installation PowerShell neu öffnen.
- Optional [Git für Windows](https://git-scm.com/downloads/win). Alternativ das Repository als ZIP herunterladen und entpacken.
- Für Transkription: ein eigener API-Key, beispielsweise für Gemini. Textnachrichten und Aufnahmen funktionieren auch ohne eingerichteten Anbieter.

Es sind kein WSL, Docker, Cloudflare-Konto oder ChatGPT-Login erforderlich. Die SQLite-Datenbank wird beim ersten Start automatisch angelegt.

## Einrichten

In PowerShell:

```powershell
git clone https://github.com/hutauf/Stimmraum.git
cd Stimmraum
npm.cmd ci
Copy-Item .env.local.example .env.local
notepad .env.local
```

Bei einem ZIP stattdessen in den entpackten Projektordner wechseln und mit `npm.cmd ci` beginnen. Der Projektordner enthält `package.json`.

In `.env.local` den eigenen Schlüssel eintragen und speichern:

```dotenv
GEMINI_API_KEY=hier_den_eigenen_Schluessel_eintragen
GEMINI_MODEL=gemini-2.5-flash
```

Der Schlüssel bleibt serverseitig. `.env.local` und lokale Daten sind von Git ausgeschlossen. Die Beispieldateien enthalten keine Zugangsdaten. Modellverfügbarkeit und Quoten hängen vom eigenen Anbieterprojekt ab. Für andere Anbieter siehe [README](README.md).

Danach:

```powershell
npm.cmd run build:local
npm.cmd run start:local
```

Im Browser **http://localhost:3000** öffnen und den Mikrofonzugriff erlauben. Unter Einstellungen den konfigurierten Anbieter auswählen. Das PowerShell-Fenster bleibt während der Nutzung geöffnet. Mit **Strg+C** den Server beenden.

`npm.cmd` umgeht das häufige Windows-Problem, dass die PowerShell-Ausführungsrichtlinie `npm.ps1` blockiert. Eine Änderung der Ausführungsrichtlinie ist nicht nötig.

## Später starten und aktualisieren

Später genügt im Projektordner:

```powershell
npm.cmd run start:local
```

Nach Änderungen am API-Key den Server neu starten. Für ein Update zunächst den Server beenden, dann:

```powershell
git pull --ff-only
npm.cmd ci
npm.cmd run build:local
npm.cmd run start:local
```

Die persönliche `.env.local` dabei behalten. Falls Port 3000 bereits belegt ist, in dieser Datei `STIMMRAUM_PORT=3001` setzen und anschließend http://localhost:3001 öffnen. Browserdaten sind an die Adresse inklusive Port gebunden; am besten dauerhaft dieselbe Adresse verwenden.

## Daten, Offline-Modus und Sicherung

- Chats, Texte und Vorlagen liegen serverseitig unter `data/stimmraum.sqlite`. Zum Sichern den Server beenden und den gesamten Ordner `data` kopieren. Beim Wiederherstellen ebenfalls den Server beenden.
- Noch nicht transkribierte Audioaufnahmen liegen in IndexedDB im jeweiligen Browserprofil. Sie sind **nicht** in der SQLite-Sicherung enthalten. Browserdaten nicht löschen, solange Aufnahmen ausstehen.
- Zum Einrichten und Bauen wird Internet benötigt. Die installierte App kann anschließend lokal aufnehmen und Texte verwalten. Anbietertranskription braucht Internet; die Warteschlange wird bei geöffneter App erneut verarbeitet.
- Eine PWA-Installation über Edge/Chrome ist möglich, nachdem die Anwendung einmal geladen wurde. Die installierte App startet den Node-Server nicht automatisch.
- Diese lokale Installation verwendet eine eigene Datenbank. Chats aus einer anderen gehosteten Stimmraum-Installation werden nicht automatisch übernommen.

## Zugriff

Der lokale Server lauscht ausschließlich auf `127.0.0.1` und prüft den Hostnamen. Er ist für deinen Windows-PC und dessen Benutzer vorgesehen und hat keinen zusätzlichen Login. Auf gemeinsam genutzten PCs getrennte Windows-/Browserprofile verwenden.

`localhost` auf einem Smartphone bezeichnet das Smartphone selbst. Diese Startvariante stellt die App nicht im Heimnetz oder Internet bereit. Für geräteübergreifenden Zugriff ist eine gesonderte Bereitstellung mit HTTPS und Zugriffsschutz nötig.

## Prüfung und Fehlerhilfe

Der lokale Build sowie HTTP-, Datenbank-, Bearbeitungs-, Lösch- und Neustarttests wurden unter **Linux mit Node.js 24** ausgeführt. Die Startskripte verwenden plattformunabhängige Node-APIs; ein realer Windows-Durchlauf und Mikrofontest sind noch offen.

```powershell
node --version
node --test tests/local-server.test.mjs tests/records.test.mjs tests/rendered-html.test.mjs tests/deletion-storage.test.mjs
```

- **Build fehlt:** `npm.cmd run build:local` ausführen.
- **`node:sqlite` oder `registerHooks` nicht verfügbar:** Node.js 24 installieren und das Terminal neu öffnen.
- **Anbieter nicht bereit:** `.env.local` im Projektordner prüfen; Gemini benötigt Key und Modell. Danach Server neu starten.
- **Mikrofon nicht verfügbar:** Windows-Einstellungen → Datenschutz und Sicherheit → Mikrofon sowie die Website-Berechtigungen im Browser prüfen.
- **Transkription scheitert:** Den Fehler an der Nachricht prüfen; Schlüssel, verfügbares Modell, Internet und Anbieterquote kontrollieren. Die Aufnahme bleibt für einen erneuten Versuch erhalten.

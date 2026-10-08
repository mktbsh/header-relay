# Chrome Web Store Listing (Deutsch)

Deutscher Lokalisierungstext für den Bereich „Storeeintrag" im Developer Dashboard.

## Product Details

### Name

Header Relay — Anfrage-Header ändern und Antwort-Header erfassen

### Summary

Erfasst HTTP-Antwort-Header und leitet feste oder erfasste Anfrage-Header für die API-Entwicklung und das Testen weiter.

### Category

Developer Tools

### Language

German

### Detailed Description

Header Relay hilft Entwicklern, das browserbasierte HTTP-Anfrageverhalten zu überprüfen, wenn eine API oder Web-App von benutzerdefinierten Headern, Gateway-Headern, Sitzungstoken, Trace-IDs oder umgebungsspezifischen Anfragemetadaten abhängt.

Erstellen Sie ein Profil, wählen Sie Ziel-Origins aus, konfigurieren Sie feste Anfrage-Header und legen Sie fest, welche Antwort-Header erfasst werden sollen. Enthält eine passende Antwort einen konfigurierten Erfassungsheader, behält Header Relay diesen Wert für die aktuelle Browsersitzung im Speicher und verwendet die declarativeNetRequest-Sitzungsregeln von Chrome, um ihn an spätere passende Anfragen anzuhängen.

Hauptfunktionen:

- Origin-bezogene Header-Weiterleitung für lokale, Staging-, interne und Testumgebungen.
- Feste Anfrage-Header für Werte, die immer angehängt werden sollen.
- Erfasste Antwort-Header für Werte wie Sitzungstoken, Trace-IDs oder Gateway-Header.
- Ausschlusspfad-Glob-Muster für Assets oder Endpunkte, die keine vom Relay verwalteten Header erhalten sollen.
- Ausschlusspfad-Tester zur Überprüfung von Glob-Übereinstimmungsregeln vor dem Speichern.
- URL Probe zur Prüfung, ob eine URL erfasst, ausgeschlossen ist und welche Header angehängt würden — funktioniert auch mit ungespeicherten Entwürfen.
- Vollbild-Einstellungen mit abschnittsbasierter Navigation für Profile, Origins, Header, Ausschlusspfade, URL Probe und Audit-Protokolle.
- Mehrere Profile können gleichzeitig aktiviert bleiben, einzelne Profile können gelöscht werden, wenn sie nicht mehr benötigt werden.
- Komfortable und kompakte Anzeigemodi, die von Popup und Einstellungsseite gemeinsam genutzt werden.
- Einheitliche iOS-Stil-Oberfläche in Popup und Einstellungen für ein konsistentes, natives Erscheinungsbild.
- Kompakte Popup-Statusansicht für aktive Header, erfasste Werte, Sitzungsstatus und Anzahl der DNR-Regeln.
- Lokale Audit-Protokolle mit automatischer Aufbewahrung; Anfrage-URLs werden nie dauerhaft gespeichert.
- Lokalisierung in Japanisch, Koreanisch, Spanisch, Französisch, Deutsch, vereinfachtem Chinesisch und traditionellem Chinesisch.

Datenschutz und Sicherheit:

- Header Relay sendet keine Profileinstellungen, Audit-Protokolle, Nutzungsereignisse, Analyse-Kennungen, Browserdaten oder erfassten Header an den Entwickler, Analyseanbieter oder unabhängige Server. Konfigurierte Header-Werte werden nur an Anfragen angehängt, die zu den Ziel-Origins passen.
- Erfasste Werte werden ausschließlich im speicherinternen Sitzungsspeicher gehalten und gelöscht bei Browser-Neustart, Deaktivierung/Neuladen/Aktualisierung der Erweiterung, Profildeaktivierung, Regeländerungen, Widerruf des Hostzugriffs oder manuellem Löschen; die UI zeigt sie unverändert an, damit Entwickler sie prüfen können.
- Sensible Headernamen zeigen eine Warnung an. `Cookie` bleibt für Entwicklungs-Workflows mit einer expliziten Warnung zum Browserstatus verfügbar; reine Antwort-Header und vom Transport verwaltete Header werden abgelehnt.
- Audit-Protokolle speichern keine Anfrage-URLs: URLs werden nur im Speicher zur Origin-Zuordnung verarbeitet und beim Schließen des Browsers verworfen.
- HTTP-localhost-Zugriff ist für den standardmäßigen lokalen Entwicklungs-Workflow enthalten. Jeder andere Host wird erst angefragt, wenn sein Ziel-Origin hinzugefügt wird, und die optionale Berechtigung kann jederzeit über die Chrome-Erweiterungseinstellungen widerrufen werden.

Diese Erweiterung ist für Entwickler- und QA-Workflows gedacht. Verwenden Sie sie nicht zum Speichern von Produktionsanmeldedaten, es sei denn, dies ist für Ihr lokales Browserprofil akzeptabel.

Version 0.5.0 — Host-Berechtigungen pro Origin, nur sitzungsbezogene erfasste Werte, Schutzmaßnahmen für sensible Header, löschbare Profile, kompakte Anzeigeeinstellungen und rein diagnostische Audit-Protokolle hinzugefügt.

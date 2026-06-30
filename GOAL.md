# GOAL – ÖTM-spezifische Aufnahme-App auf Basis von GeoLibre

> Status: Living Document (erweiterbar)
>
> Owner: randanplan
>
> Stand: 2026-06-29

## 1) Ausgangslage

Für drei zugeordnete Lose liegen ÖTM-Unterlagen in `.oetm` vor (inkl. PDFs, Excel-Dateien und Logs). Die PDF-Dokumente enthalten Leitungsabschnitte, die auf Vegetationsbewuchs und Sicherheitsabstände geprüft werden.

Aktueller Prozess:

- Sichtung/Markierung in Bluebeam Revu PDF
- Setzen von Flächen-/Punkt-/Linienmarkierungen inkl. Annotationen
- Nutzung des Dokumentenmaßstabs zur Flächenbewertung (z. B. qm)

## 2) Zielbild (fachlich)

Eine GeoLibre-basierte ÖTM-Aufnahme-App soll den aktuellen PDF-zentrierten Workflow schrittweise ablösen bzw. ergänzen.

### 2.1 Primärziele (kurzfristig, hoher Nutzen)

1. **Kartenübersicht aller PDF-Blattschnitte**
   - Darstellung je PDF als Geometrie auf einer Karte (mindestens BBOX/Rechteck)
   - Sichtbarer Bezug zwischen Karte und PDF-Dateiname
   - Unabhängigkeit von PDF-Nummerierung vs. realem Leitungsverlauf

2. **Statusmanagement pro PDF-Blatt**
   - Farbliche Kennzeichnung (z. B. offen / in Arbeit / kontrolliert)
   - Filter/Ausblenden bereits kontrollierter Blätter

3. **Optionale Kartenvorschau pro Blatt**
   - Statt nur Rechteck: möglichst tatsächlicher Kartenausschnitt als Vorschau (z. B. PNG-Crop)

4. **Strommasten auf der Karte visualisieren**
   - Laden der Mast-Koordinaten aus `Mengengerüst_*.xlsx` (Tabelle `2026-27`)
   - Darstellung als Punkte/Symbole auf der Karte
   - Verknüpfung mit Session-Status (freigestellt / nicht freigestellt)
   - Farbcodierung nach Freigabestatus (z. B. grün = freigegeben, grau = ausstehend)
   - Filterung nach Freistellung für schnelle Übersicht

5. **Integration mit Mengengerüst-Excel**
   - Automatisches Auslesen der Mast-Liste pro Los aus `Mengengerüst_*.xlsx`
   - Zuordnung Mast ↔ Blattschnitt (aus Log + Excel)
   - Statusabgabe aus App zurück in Excel

### 2.2 Sekundärziele (mittelfristig)

1. **Direkte Markierung in der App**
   - Punkte, Linien, Flächen inkl. Attributen/Kommentar
   - Vorbereitung auf Ablösung des Revu-PDF-Schritts

2. **Maßnahmen-Tracking in strukturierter Form**
   - Anbindung an Datenhaltung (zunächst Excel-kompatibel, später DB)
   - Nachvollziehbare Einträge pro Maßnahme

3. **Finalisierung via Auf-Abnahmeformular-Excel**
   - Export der erfassten Maßnahmen in `Auf-Abnahmeformular_26-27.xlsx`
   - Strukturierte Abgabe an Westnetz (Dokumentation, Unterschriften, Datumsstempel)
   - Kompatibilität mit Formularstruktur (Losbezeichnung, Aufnahmezeitraum, Maßnahmenliste, Bearbeitungsflächenbewertung)

## 3) Technische Leitplanken

- GeoLibre-Fork wird regelmäßig mit Upstream (`opengeos/GeoLibre`) aktualisiert.
- Umsetzung soll deshalb möglichst **plugin-zentriert** erfolgen (geringe Upstream-Rebase-Reibung).
- PDFs sind vektorhaltig; Analyse via **PyMuPDF** ist möglich.
- Georeferenzierung soll über bekannte Mast-Koordinaten und zugehörige PDF-Punkte erfolgen.

## 4) Bereits bekannte Datenbasis

Pfad: `c:\Users\randanplan\repos\.oetm`

Lose:

- `2006 Köln`
- `2008 Düsseldorf-Neuss`
- `2009 Mönchengladbach-Grevenbroich`

Je Los vorhanden:

- **`Auf-Abnahmeformular_*.xlsx`** (neue Integration)
  - Finale Dokumentation für Abgabe an Westnetz
  - Struktur: Losbezeichnung, Aufnahmezeitraum, Feldtrupp-Namen, ÖTM-Plannummer (Link zu PDF), Maßnahmenbeschreibung (Gruppe, Hecke, Sukzessionsfläche, Bäume), Koordinaten, Größe (L×B), Fläche (m²), Entnahmequoten, Dauerbarkeitskategorien, Schadenskategorien, Abarbeitungsdatum, Abnahmesignatur
  
- **`Mengengerüst_*.xlsx`** (neue Integration)
  - Blatt `2026-27`: Mast-/Polmetadaten pro Los
  - Enthält Koordinaten, Masten-ID, Freigabestatus, Zugehörigkeit zu Blattschnitten
  - Source für Mast-Darstellung auf der Karte
  
- `Viele ÖTM_*.PDF` (vektorhaltig, analysierbar via PyMuPDF)

- `Log_*.log` (mit Mast↔Blattschnitt-Hinweisen, Koordinatendaten)

## 5) Erfolgskriterien (Definition of Success)

### MVP erfolgreich, wenn

- Ein Layer mit allen Blattschnitten auf der Karte darstellbar ist.
- Jeder Blattschnitt eindeutig einem PDF zugeordnet ist.
- Status je Blatt (offen/in Arbeit/erledigt) gesetzt, visualisiert und gefiltert werden kann.
- **Strommasten aus `Mengengerüst_*.xlsx` auf der Karte sichtbar und nach Freigabestatus filterbar sind.**
- Mindestens ein Los vollständig im Workflow nutzbar ist.

### Phase 2 erfolgreich, wenn

- Direktes Erfassen von Maßnahmen in der App möglich ist.
- Export/Synchronisierung in bestehende Excel- oder DB-Struktur funktioniert.

### Phase 3 erfolgreich, wenn

- Maßnahmen aus der App in `Auf-Abnahmeformular_*.xlsx` exportierbar sind.
- Strukturierte Abgabe an Westnetz (mit korrekten Spalten, Unterschriften, Zeitstempel) funktioniert.

## 6) Nicht-Ziele (vorerst)

- Vollständiger Ersatz aller Spezialfunktionen von Bluebeam Revu im ersten Schritt.
- Vollautomatische Georeferenzierung ohne Qualitätskontrolle.
- Big-Bang-Rollout über alle Lose ohne Pilotphase.

## 7) Offene Fragen (laufend pflegen)

- Welche Statuswerte sind final fachlich erforderlich? (z. B. offen, in Arbeit, kontrolliert, abgenommen?)
- Welche Pflichtattribute braucht eine Maßnahme (Priorität, Frist, Kategorie, Bearbeitete Fläche m²)?
- Welche Genauigkeit ist für Georeferenzierung ausreichend?
- Welche Excel-Strukturen sind verbindlich (Spalten, IDs, Schreibrechte)?
- Soll die Vorschau als statisches PNG oder als georeferenzierte Rasterebene erfolgen?
- **Welche Spalten aus `Mengengerüst_*.xlsx` sind erforderlich? (Mast-ID, Koordinaten, Freigabestatus, Blattschnitt-Zuordnung?)**
- **Welche Spalten aus `Auf-Abnahmeformular_*.xlsx` sind Pflicht für Westnetz-Abgabe? (Unterschrift, Datum, QA-Vermerk?)**
- **Kann die Mast-Datierung aus Log-Dateien oder nur aus Mengengerüst stammen?**

## 8) Änderungsprotokoll

- 2026-06-29: Erstfassung erstellt.
- 2026-06-30: Status-Check — Phase 0.1 (Plugin-Grundgerüst) abgeschlossen; Git-Sync mit upstream opengeos/GeoLibre:main (7 Commits hinterher). Nächste Schritte: 0.4 Sidecar-Router, 0.2/0.3 Client-Parsing.

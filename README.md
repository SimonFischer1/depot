# Depot — interaktive Demo (aktualisiert)

Änderungen gegenüber der ersten Version:
- Dunkles Theme mit mint-accent Farben (an dein Bild angelehnt).
- Korrigierte Preis-/Wertberechnung: currentPrice wird als Preis pro Einheit behandelt; P/L und Wert berechnet als currentPrice * quantity.
- History: beim Klick auf "Aktuelle Preise holen" werden Snapshots gespeichert; daraus entsteht eine Zeitreihe (Portfolio-Wert) für das Verlaufschart.
- Zusätzliche Diagramme: Portfolio-Verlauf (line) und ein Scatter/Bubble-Plot, der Kaufpreis vs. aktueller Preis pro Einheit vergleicht.
- Verbesserte CoinGecko-Integration: die Coins-Liste wird einmal geladen, um Name/Symbol besser auf CoinGecko-IDs zu mappen.

Nutzung:
1. Öffne `index.html` lokal oder hoste via GitHub Pages (siehe vorherige Commit-Nachricht / Actions Workflow).
2. Trage Käufe ein. Klicke "Aktuelle Preise holen" — dann werden crypto/aktien/rohstoffpreise versucht und ein Snapshot für die Zeitreihe angelegt.

Hinweise:
- Aktien-/Metallpreise sind weiterhin "best-effort" über einen öffentlichen Proxy; für Produktionsverwendung bitte ein eigenes Backend/API verwenden.
- Wenn du willst, kann ich ein kurzes Node/Express-Proxy-Backend hinzufügen und eine Anleitung geben, wie du einen (kostenlosen) API-Key (z. B. Finnhub) konfigurierst.

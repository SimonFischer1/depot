# Depot — interaktive Demo

Dieses Repository enthält eine einfache statische Frontend-Demo einer "Depot"-Web-App.

Funktionen:
- Einfache Eingabe von Käufen (Kryptos, Aktien, Gold, Silber, Kupfer, ETFs)
- Speicherung im Browser (localStorage)
- Automatische Preisabfrage für Kryptowährungen via CoinGecko
- Versuche, Aktien/ETFs/Metalle über einen Yahoo-Finance-Endpunkt (via allorigins Proxy) abzurufen (kann wegen CORS fehlschlagen)
- Grafische Darstellung (Chart.js) der Portfolio-Allokation und Gewinn/Verlust
- Tagesgeld-Rechner mit Reinvestitionsoption

Anleitung:
1. Öffne `index.html` in einem Browser (lokal oder gehostet). 
2. Füge Einträge hinzu, klicke "Aktuelle Preise holen" um verfügbare Preise zu aktualisieren.

Hinweise / Erweiterungen:
- Für zuverlässige Aktien- / Rohstoffpreise empfiehlt es sich, einen eigenen Backend-Proxy oder API-Key-gestützte Service (z.B. AlphaVantage, Finnhub, Metals-API) zu integrieren.
- Styling ist angelehnt an die Farben von scalable.capital.

Viel Spaß — ich kann das weiter ausbauen (z.B. CSV-Import/Export, historische Kurse, Performance über Zeit, Auth/Accounts, Hosting-Konfiguration).
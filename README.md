# Yannick & Felix – Sport Challenge

Kostenlose private Web-App mit Supabase als Backend.

## Enthalten
- Login für zwei Teilnehmer
- eigene Sporteinheiten eintragen
- nachträgliche Einträge
- 3 Einheiten pro Montag–Sonntag
- automatische Strikes
- 15-€-Penalty bei 3 Strikes
- automatische Kassenkorrektur bei Nachträgen
- Admin-Funktionen für Felix
- Statistikvergleich
- Kassenverwaltung

## Kostenlos veröffentlichen

1. Ein kostenloses Supabase-Projekt erstellen.
2. `supabase.sql` im Supabase SQL Editor ausführen.
3. In Supabase Auth zwei Benutzer anlegen:
   - Yannick
   - Felix
4. Die jeweiligen User-UUIDs in `profiles` eintragen; Felix bekommt `is_admin = true`.
5. In `config.js` die Supabase Project URL und den Anon Key eintragen.
6. Den Ordner auf GitHub hochladen und GitHub Pages aktivieren.

Die Supabase-Anon-Key darf in einer Frontend-App stehen. Der Schutz kommt durch Row Level Security (RLS); der Service-Role-Key gehört niemals in diese Website.

## Hinweis
Diese Version ist der erste technische Prototyp. Vor einem echten Einsatz sollten insbesondere die automatische Abrechnung und die gewünschte Kassenhistorie einmal gemeinsam getestet werden.

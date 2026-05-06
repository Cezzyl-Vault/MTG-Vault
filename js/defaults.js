// ══════════════════════════════════════════════════════════
//  DEFAULTS  ·  Festkodierte Standard-Konfiguration
// ══════════════════════════════════════════════════════════
//
//  Hier liegen die Supabase-Verbindungsdaten, damit du den
//  Setup-Bildschirm nicht jedes Mal neu ausfüllen musst.
//
//  Sicherheitseinordnung:
//    - Die URL und der Anon-Public-Key SIND dafür gedacht, im
//      Browser-Code zu landen. Sie alleine erlauben kein Daten-
//      Zugriff — Row Level Security in der Datenbank verlangt
//      eine echte Login-Session.
//    - Der Login mit E-Mail und Passwort bleibt bestehen.
//
//  Falls du das Projekt mal wechselst, einfach hier neue Werte
//  eintragen. Im LocalStorage gespeicherte Config (vom Setup-
//  Bildschirm) hat Vorrang vor diesen Werten — nützlich, falls
//  du temporär ein anderes Projekt anbinden willst.

const DEFAULT_SUPABASE_URL = 'https://xzzkmbplkwhwsjrlprnq.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6emttYnBsa3dod3Nqcmxwcm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTg1NjYsImV4cCI6MjA5Mjg5NDU2Nn0.mTTpE0vC1m4wYdTgZOFX6rkB_O4VCdcn0t-VLe86mTI';

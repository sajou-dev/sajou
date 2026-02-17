# Protocoles d'entrée signal étendus
Tiers: core
---
Étendre les types de signaux au-delà du texte/JSON : audio (Web Audio API, analyse FFT), MIDI (Web MIDI API), OSC (Open Sound Control via WebSocket bridge), DMX/Art-Net (via bridge réseau). Chaque protocole a son propre adapteur qui normalise les données en enveloppes signal sajou. L'UI source discovery doit supporter ces nouveaux types de sources.

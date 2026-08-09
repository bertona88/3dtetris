# Gravity Tetris 3D

Prototipo mobile-first di un puzzle 3D ispirato a Tetris. La camera segue l'inclinazione del dispositivo e il gioco offre due modelli di gravità.

## Funzioni

- modalità **Tower**, con gravità verticale e cancellazione degli strati
- modalità **Core**, con attrazione tridimensionale verso il punto centrale
- accumulo sferico senza limite fisso: il volume di gioco cresce con il nucleo
- punteggio Core basato sulla densità del packing e sul raggio del cluster
- camera controllata dall'accelerometro, con moltiplicatori e smoothing regolabili
- movimento sui tre assi, rotazioni X/Y/Z, hard drop radiale e comandi tastiera
- controlli touch e interfaccia responsive per cellulare

## Avvio locale

```bash
npm ci
npm run dev
```

Apri l'indirizzo indicato dal server di sviluppo.

## Build

```bash
npm run build
```

Versione online: https://tetris-3d-swipe.abertoncini.chatgpt.site

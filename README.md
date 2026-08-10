# 3D Blocks

Prototipo mobile-first di un puzzle 3D di blocchi, con Tetris citato esclusivamente come antenato storico del gameplay e un'identita visiva indipendente. La camera segue l'inclinazione del dispositivo e il gioco offre due modelli di gravita.

## Funzioni

- modalità **Tower**, con gravità verticale e cancellazione degli strati
- modalità **Core**, con attrazione tridimensionale verso il punto centrale
- accumulo sferico senza limite fisso: il volume di gioco cresce con il nucleo
- punteggio Core basato sulla densità del packing e sul raggio del cluster
- camera controllata dall'orientamento del dispositivo, con moltiplicatori e smoothing regolabili
- swipe relativo alla camera per muovere il pezzo, tap per ruotarlo e pressione lunga per il drop
- doppi joystick virtuali sui tablet: movimento relativo alla vista a sinistra, rotazione e altezza a destra
- controlli tastiera e interfaccia responsive per cellulare e tablet

Questa implementazione e collegata alla [Wofi Idea Gyroscopic 3D Block-Stacking View](https://wofi.ai/ideas/sha256%3Ac472014b92b2e4c50702ad044544f964707a78157100c5e79ce161bc01eca510).

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

Versione online: https://3dblocks.wofi.ai

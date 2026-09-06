# 3D Blocks

Prototipo mobile-first di un puzzle 3D di blocchi, con Tetris citato esclusivamente come antenato storico del gameplay e un'identita visiva indipendente. Si inizia senza timer, con un primo strato guidato. La camera rimane fissa finché il giocatore non sceglie di attivare il movimento.

## Funzioni

- **Relaxed** predefinito: nessuna caduta automatica, forme semplici e annullamento dell'ultimo blocco
- primo strato guidato, punteggio iniziale zero e messaggio quando viene completato
- anteprima esatta della posizione di atterraggio e della forma successiva
- **Challenge**: caduta iniziale lenta che accelera con i progressi
- pulsanti visibili per muovere, ruotare e posare; viste 3D, dall'alto, frontale e laterale
- pausa automatica quando si lascia la finestra; conferma prima di iniziare una nuova partita
- record salvato soltanto sul dispositivo, separato per modalità e ritmo
- modalità **Patch**, griglia 9 × 9 con cancellazione di quadrati 3 × 3

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

## Controlli

Frecce o WASD per muovere rispetto alla vista; R per girare; Spazio per posare;
U per annullare in Relaxed; P o Esc per mettere in pausa. X/Y/Z ruotano sui tre
assi. Su schermo: trascina per muovere, tocca per girare oppure usa i pulsanti.
Il movimento della camera va attivato esplicitamente nelle impostazioni.

## Verifica

Su Linux, `npm test` esegue build, validazione Worker, regole di gioco e test
HTML. `npm run lint` è separato. Il motore puro in `app/game-engine.ts`
permette di verificare collisioni, atterraggio, undo, velocità e mapping dei
controlli senza dipendere dal rendering.

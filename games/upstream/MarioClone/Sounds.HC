Bool AnySoundActive()
{
 return jumpSoundActive || brickSoundActive ||
        coinSoundActive ||
        powerUpSoundActive ||
        powerUpAppearSoundActive || shrinkSoundActive ||
        dyingSoundActive || stompSoundActive;
}
U0 WaitForSilence()
{
 while (AnySoundActive())
  Sleep(5);
}
U0 SongTask()
{
 Fs->task_end_cb=&SndTaskEndCB;
 MusicSettingsRst;

 while(TRUE){

  music.tempo = 4;
  music.stacatto_factor = 1;

// WaitForSilence; Play("5eE5Er5Er5C5Erh5G4hrGr");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5hG"); WaitForSilence; Play("4hr"); WaitForSilence; Play("4hG"); WaitForSilence; Play("4hr"); WaitForSilence; Play("4hG");

// WaitForSilence; Play("q5Cr4GrErArBrB#Ar");
WaitForSilence; Play("5qC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB#"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA");

// WaitForSilence; Play("G5ErGqAeFGrqEeCD4hBr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5qA"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5qr"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("4hB"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5qCr4GrErArBrB#rArG");
WaitForSilence; Play("5qC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB#"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er"); WaitForSilence; Play("5eG");

// WaitForSilence; Play("e5ErGrArFGrErCD4hBrr");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("4hB"); WaitForSilence; Play("4er"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5eGF#FD#rEr4A#A5Cr4A5CDr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF#"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5GF#FD#rE6CrChCr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF#"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("6eC"); WaitForSilence; Play("6er"); WaitForSilence; Play("6hC"); WaitForSilence; Play("6er"); WaitForSilence; Play("6eC"); WaitForSilence; Play("6er");

// WaitForSilence; Play("5eGF#FD#rEr4A#A5Cr4A5CDr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF#"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5D#rrDrhCr");
WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eD"); WaitForSilence; Play("5er"); WaitForSilence; Play("5hC"); WaitForSilence; Play("5er");

// WaitForSilence; Play("5eG5F#5F5D#r5Er4A#4A5Cr4A5C5Dr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF#"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("5er");

// WaitForSilence; Play("5G5F#5F5D#r5E6Cr6Ch6Cr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF#"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("6eC"); WaitForSilence; Play("6er"); WaitForSilence; Play("6hC"); WaitForSilence; Play("6er"); WaitForSilence; Play("6eC"); WaitForSilence; Play("6er");

// WaitForSilence; Play("5eG5F#5F5D#r5Er4A#4A5Cr4A5C5Dr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF#"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("5er");

// WaitForSilence; Play("5D#r5Drh5Cr");
WaitForSilence; Play("5eD#"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eD"); WaitForSilence; Play("5er"); WaitForSilence; Play("5hC"); WaitForSilence; Play("5er");

// WaitForSilence; Play("4eC4Cr4Cr4C4Dr4E4C3r3Ah3G");
WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4eD"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4eC"); WaitForSilence; Play("3er"); WaitForSilence; Play("3hA"); WaitForSilence; Play("3hG");

// WaitForSilence; Play("4eC4Cr4Cr4C4Dw4E");
WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4eD"); WaitForSilence; Play("4wE");

// WaitForSilence; Play("4eC4Cr4Cr4C4Dr4E4C3rAh3G");
WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4eD"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4eC"); WaitForSilence; Play("3er"); WaitForSilence; Play("3hA"); WaitForSilence; Play("3hG");

// WaitForSilence; Play("5eE5Er5Er5C5Erh5G4hrGr");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5er"); WaitForSilence; Play("5hG"); WaitForSilence; Play("4hr"); WaitForSilence; Play("4hG"); WaitForSilence; Play("4hr"); WaitForSilence; Play("4hG");

// WaitForSilence; Play("q5Cer4GrErArBrB#Ar");
WaitForSilence; Play("5qC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB#"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA");

// WaitForSilence; Play("G5ErGqAeFGrqEeCD4hBr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5qA"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5qr"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("4hB"); WaitForSilence; Play("4er");

// WaitForSilence; Play("q5Cer4GrErArBrB#Ar");
WaitForSilence; Play("5qC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eB#"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA");

// WaitForSilence; Play("G5ErGqAeFGrqEeCD4hBr");
WaitForSilence; Play("5eG"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5qA"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5qr"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5eD"); WaitForSilence; Play("4hB"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5eECr4GrA#A5FrF4Ar");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eF"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er");

// WaitForSilence; Play("4eB5AAAGFEC4rAGrr");
WaitForSilence; Play("4eB"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5eECr4GrA#A5FrF4Ar");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eF"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er");

// WaitForSilence; Play("4eB5FrFFEDhCrr");
WaitForSilence; Play("4eB"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eD"); WaitForSilence; Play("5hC"); WaitForSilence; Play("5er"); WaitForSilence; Play("5er");

// WaitForSilence; Play("4eB5AAAGFEC4rAGrr");
WaitForSilence; Play("4eB"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5eA"); WaitForSilence; Play("5eG"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4er");

// WaitForSilence; Play("5eECr4GrA#A5FrF4Ar");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5er"); WaitForSilence; Play("4eG"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eA#"); WaitForSilence; Play("4eA"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eF"); WaitForSilence; Play("4eA"); WaitForSilence; Play("4er");

// WaitForSilence; Play("4eB5FrFFEDhCrr");
WaitForSilence; Play("4eB"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eF"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5eD"); WaitForSilence; Play("5hC"); WaitForSilence; Play("5er"); WaitForSilence; Play("5er");

// WaitForSilence; Play("4eC4CrCrCDrEC3rAhG");
WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4eD"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4eC"); WaitForSilence; Play("3er"); WaitForSilence; Play("3hA"); WaitForSilence; Play("3hG");

// WaitForSilence; Play("4eC4CrCrCDwE");
WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4eD"); WaitForSilence; Play("4wE");

// WaitForSilence; Play("4eC4CrCrCDrEC3rAhG");
WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eC"); WaitForSilence; Play("4eD"); WaitForSilence; Play("4er"); WaitForSilence; Play("4eE"); WaitForSilence; Play("4eC"); WaitForSilence; Play("3er"); WaitForSilence; Play("3hA"); WaitForSilence; Play("3hG");

// WaitForSilence; Play("5eE5Er5Er5C5Erh5G4hrGr");
WaitForSilence; Play("5eE"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eE"); WaitForSilence; Play("5er"); WaitForSilence; Play("5eC"); WaitForSilence; Play("5er"); WaitForSilence; Play("5hG"); WaitForSilence; Play("4hr"); WaitForSilence; Play("4hG"); WaitForSilence; Play("4hr"); WaitForSilence; Play("4hG");
 }
}

U0 AnimateTask()
{
 while(TRUE){
  if(jumpSoundActive){
   music.tempo=32;
   Play("e4D4C#4D4D#4E4F4F#4G4G#A4A#4B5C5C5#D4"); //blocks here, which is fine in this thread
   music.stacatto_factor = 1;
   music.tempo=4;
   jumpSoundActive = 0;
  } else if (coinSoundActive){
   music.tempo=12;
   Play("e6B7hEr4");  
   music.stacatto_factor = 1;
   music.tempo=4;
   coinSoundActive = 0;
  } else if(powerUpSoundActive){
   music.tempo=32;
   Play("e5C4G5C5E5G6C5G4G#5C5D#5D#5G#5G#6C6D#6E#6D#4A#5D5F5A#5F5A#6D6F6A#6F4");
   music.stacatto_factor = 1;
   music.tempo=4;
   powerUpSoundActive = 0;
  } else if(powerUpAppearSoundActive){
   music.tempo=11;
   Play("e4C4G4G#4C#4G#4A4D4A4A#4E#4A#4qB");
   music.stacatto_factor = 1;
   music.tempo=4;
   powerUpAppearSoundActive = 0;
  } else if(dyingSoundActive){
   music.tempo = 2.5;  
   Play("4eA#Grr2G4BB5F3GAB4CqG#3B1Cq2C");
   music.tempo=4;
   dyingSoundActive = 0;
  } else if(stompSoundActive){
   music.tempo =12;
   Play("4eB5CC#DGG#AA#");
   music.tempo = 4;
   stompSoundActive = 0;
  } else if(shrinkSoundActive){
   music.tempo  = 10;
   Play("4eAGECrAGECrAGEC");
   music.tempo = 4;
   shrinkSoundActive = 0;
  } else if(brickSoundActive){
   music.tempo  = 20;
   Play("2D#DC#C1A#GFE3D#DC#C2A#GFE");
   music.tempo = 4;
   brickSoundActive = 0;
  }

  Yield;  
 }
}
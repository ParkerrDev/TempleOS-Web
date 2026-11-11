I64 tm_input_cases=0,tm_input_keys=0,tm_input_done=0;

U0 TmInputTest()
{
  I64 *rows=FileRead("C:/ORACLE/INPUT.BIN"),*row,n,i,j,keys,expected,used;
  Controls input;
  U8 bitmap[32];
  if (!rows) throw('Files');
  used=Fs->data_heap->used_u8s; ControlsInit(&input);
  if (input.turn_tics || input.forward || input.side || input.turn ||
	input.buttons || input.weapon!=TM_WP_NOCHANGE) throw('Init');
  n=*rows; row=rows+1;
  for (i=0;i<n;i++,row+=8) {
    input.turn_tics=row[1]; ControlsCmd(&input,row[0]);
    if (input.turn_tics!=row[2] || input.forward!=row[3] ||
	  input.side!=row[4] || input.turn!=row[5] ||
	  input.buttons!=row[6] || input.weapon!=row[7]) {
      "INPUT %d KEYS %X HELD %d\n",i,row[0],row[1];
      throw('Command');
    }
    tm_input_cases++;
  }
  for (i=0;i<TM_KEY_NUM;i++) {
    MemSet(bitmap,0,sizeof(bitmap)); Bts(bitmap,input.scan[i]);
    if (ControlsKeys(&input,bitmap)!=1<<i) throw('Key');
    tm_input_keys++;
  }
  for (i=0;i<256;i++) {
    MemSet(bitmap,0,sizeof(bitmap)); expected=0;
    for (j=0;j<4;j++) {
      if (Bt(&i,j)) Bts(bitmap,input.scan[TMf_KEY_UP+j]);
      if (Bt(&i,j+4)) Bts(bitmap,input.scan[TM_KEY_NUM+j]);
      if (Bt(&i,j) || Bt(&i,j+4)) Bts(&expected,TMf_KEY_UP+j);
    }
    if (ControlsKeys(&input,bitmap)!=expected) throw('Alias');
    tm_input_keys++;
  }
  MemSet(bitmap,0xFF,sizeof(bitmap)); keys=ControlsKeys(&input,bitmap);
  expected=1<<TM_KEY_NUM; expected--;
  if (keys!=expected) throw('All');
  MemSet(bitmap,0,sizeof(bitmap));
  ControlsCmd(&input,ControlsKeys(&input,bitmap));
  if (input.turn_tics || input.forward || input.side || input.turn ||
	input.buttons || input.weapon!=TM_WP_NOCHANGE) throw('Release');
  tm_input_keys+=2;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  Free(rows); tm_input_done=1;
  "INPUT %d COMMANDS %d BITMAPS BAD 0\n",tm_input_cases,tm_input_keys;
}

TmInputTest;

//test
U0 SetKey(KeyState *k, Bool down){
 k->isDown = down;
}

U0 HandleCharKeyDown(I64 ch){
 // Dev / save text input first
 if(mc->displayDev&&ch>65&&ch<126&&ch!=96){
  AddDevChar(ch);
  return;
 }
 if(mc->displaySave&&ch>65&&ch<126){
  ModifySaveBuffer(ch);
  return;
 }
 switch(ch){
  case 'I': case 'i':
   SetKey(&keyboard.inv,TRUE);
  break;
  case 'W': case 'w':
   if(camera->cameraOffSetX==0&&camera->cameraOffSetY==0)
    SetKey(&keyboard.up,TRUE);
  break;
  case 'A': case 'a':
   if(camera->cameraOffSetX==0&&camera->cameraOffSetY==0)
    SetKey(&keyboard.left,TRUE);
  break;
  case 'S': case 's':
   if(camera->cameraOffSetX==0&&camera->cameraOffSetY==0)
    SetKey(&keyboard.down,TRUE);
  break;
  case 'D': case 'd':
   if(camera->cameraOffSetX==0&&camera->cameraOffSetY==0)
    SetKey(&keyboard.right,TRUE);
  break;
  case 'E': case 'e':
   SetKey(&keyboard.equipment,TRUE);
  break;
  case 'C': case 'c':
   SetKey(&keyboard.stats,TRUE);
  break;
  case CH_ESC:
   SetKey(&keyboard.esc,TRUE);
  break;
  case '\n':
   SetKey(&keyboard.enter,TRUE);
  break;
  case '~':
  case '`':
   SetKey(&keyboard.developer,TRUE);
  break;
  default:
  break;
 }
}

U0 HandleCharKeyUp(I64 ch){
 if(mc->displayDev&&ch>65&&ch<126&&ch!=96){
  return;
 }
 if(mc->displaySave&&ch>65&&ch<126){
  return;
 }

 switch(ch){
  case 'I': case 'i':
   SetKey(&keyboard.inv,FALSE);
  break;
  case 'W': case 'w':
   SetKey(&keyboard.up,FALSE);
  break;
  case 'A': case 'a':
   SetKey(&keyboard.left,FALSE);
  break;
  case 'S': case 's':
   SetKey(&keyboard.down,FALSE);
  break;
  case 'D': case 'd':
   SetKey(&keyboard.right,FALSE);
  break;
  case 'E': case 'e':
   SetKey(&keyboard.equipment,FALSE);
  break;
  case 'C': case 'c':
   SetKey(&keyboard.stats,FALSE);
  break;
  case CH_ESC:
   SetKey(&keyboard.esc,FALSE);
  break;
  case '\n':
   SetKey(&keyboard.enter,FALSE);
  break;
  case '~':
  case '`':
   SetKey(&keyboard.developer,FALSE);
  break;
  default:
  break;
 }
}


U0 HandleScanKeyDown(I64 sc){
 switch (sc) {
  case SC_ENTER:
   SetKey(&keyboard.enter, TRUE);
  break;
  start:
   if(camera->cameraOffSetX!=0||camera->cameraOffSetY!=0)
    goto escape;
   case SC_CURSOR_LEFT:
    SetKey(&keyboard.left,TRUE);
   break;
   case SC_CURSOR_RIGHT:
    SetKey(&keyboard.right,TRUE);
   break;
   case SC_CURSOR_UP:
    SetKey(&keyboard.up,TRUE);
   break;
   case SC_CURSOR_DOWN:
    SetKey(&keyboard.down,TRUE);
  break;
  end: escape: break;
  case SC_SHIFT:
   SetKey(&keyboard.shift,TRUE);
  break;
  default:
  break;
 }
}


U0 HandleScanKeyUp(I64 sc){
 switch (sc) {
  case SC_ENTER:
   SetKey(&keyboard.enter, FALSE);
  break;
  case SC_CURSOR_LEFT:
   SetKey(&keyboard.left, FALSE);
  break;
  case SC_CURSOR_RIGHT:
   SetKey(&keyboard.right, FALSE);
  break;
  case SC_CURSOR_UP:
   SetKey(&keyboard.up, FALSE);
  break;
  case SC_CURSOR_DOWN:
   SetKey(&keyboard.down, FALSE);
  break;
  case SC_SHIFT:
   SetKey(&keyboard.shift, FALSE);
  break;
  default:
  break;
 }
}
U0 InputBeginFrame()
{
 keyboard.up.wasDown = keyboard.up.isDown;
 keyboard.down.wasDown = keyboard.down.isDown;
 keyboard.left.wasDown = keyboard.left.isDown;
 keyboard.right.wasDown = keyboard.right.isDown;
 keyboard.inv.wasDown = keyboard.inv.isDown;
 keyboard.equipment.wasDown = keyboard.equipment.isDown;
 keyboard.stats.wasDown = keyboard.stats.isDown;
 keyboard.developer.wasDown = keyboard.developer.isDown;
 keyboard.esc.wasDown = keyboard.esc.isDown;
 keyboard.enter.wasDown = keyboard.enter.isDown;
 keyboard.shift.wasDown = keyboard.shift.isDown;

}
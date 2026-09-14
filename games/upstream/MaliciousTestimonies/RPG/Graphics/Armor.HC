
U0 ComputeArmorOffsets(Actor *toRender, I64 dir,I64 *xOff, I64 *yOff)
{
 // Create a value based on timer (cycle every 30 ticks)
 if(toRender->walking!=DIR_IDLE){
  F64 t = (world->timer % 30) / 30.0 * 2.0 * pi;
  I64 groffset = ToI64(Sin(t) * 3.0); // values from -3 to +3
  if(dir == DIR_RIGHT || dir == DIR_LEFT){
   *xOff += (groffset/2);
   *yOff += (groffset/2);
  } else {
   *yOff += groffset;
  }
 }

 Director *task =FindDirective(toRender);  
 if(!task)
  return;
 else{
  *xOff += task->xAOff;
  *yOff += task->yAOff;
 }
}

U0 OverlayArmor(CDC *dc, Actor *toRender)
{

 //this is a switch statement to animate the armor based on
 //the world timer status
 I64 dir = GetDir(toRender);

 I64 yOff = 0;
 I64 xOff = 0;
 ComputeArmorOffsets(toRender, dir,&xOff,&yOff);
 CDC *armor = ShowBody(toRender->armor,dir);
 CDC *hair = ShowHair(toRender->hair,dir);
 CDC *hat = ShowHelm(toRender->hat,dir);
 GrBlot3(dc,0+xOff,0+yOff,0, armor);
 GrBlot3(dc,0+xOff,0+yOff,10,hair);
 GrBlot3(dc,0+xOff,0+yOff,0, hat);

 DCDel(armor); 
 DCDel(hair); 
 DCDel(hat); 
}


//Plasma - a graphics demo exercising the framebuffer, Sin/Cos, and animation
//with the cooperative Sleep/ScanChar loop TempleOS programs use.
U0 Plasma()
{
  CDC *dc=DCAlias;
  I64 x,y,t=0,c;
  F64 v;
  while (!ScanChar) {
    for (y=0;y<480;y+=4) {
      for (x=0;x<640;x+=4) {
	v=Sin(x/40.0+t/8.0)+Cos(y/32.0-t/10.0)
	  + Sin((x+y)/50.0+t/6.0);
	c=(v+3.0)*2.5;
	dc->color=c&15;
	GrRect(dc,x,y,4,4);
      }
    }
    t++;
    Sleep(20);
  }
  DCFill(dc);
}
Plasma;

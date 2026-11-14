//Sierpinski triangle via the chaos game - framebuffer plotting + Rand.
U0 Sierpinski()
{
  CDC *dc=DCAlias;
  I64 vx[3],vy[3],i,v,px,py;
  vx[0]=320; vy[0]=40;
  vx[1]=80;  vy[1]=440;
  vx[2]=560; vy[2]=440;
  px=320; py=240;
  Seed(1);
  for (i=0;i<60000;i++) {
    v=RandU32%3;
    px=(px+vx[v])/2;
    py=(py+vy[v])/2;
    dc->color=10+v&3;
    GrPlot(dc,px,py);
    if (!(i & 1023)) {
      Yield;
      if (ScanChar) i=60000;
    }
  }
}
Sierpinski;

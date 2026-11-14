//Text-mode Mandelbrot set - exercises F64 math, nested loops, and Print.
U0 Mandelbrot()
{
  F64 x0,y0,x,y,xt;
  I64 px,py,i;
  U8 *shades=" .:-=+*#%@";
  for (py=0;py<24;py++) {
    y0=(py-12.0)/12.0*1.2;
    for (px=0;px<70;px++) {
      x0=(px-50.0)/25.0;
      x=0; y=0; i=0;
      while (x*x+y*y<4.0 && i<40) {
	xt=x*x-y*y+x0;
	y=2.0*x*y+y0;
	x=xt;
	i++;
      }
      if (i>=40) '#';
      else "%c",shades[i*10/40];
    }
    '\n';
  }
}
Mandelbrot;

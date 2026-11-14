//Paint - an interactive mouse/touch demo. Move the pointer to draw; hold the
//left button (or touch) to paint a fat brush; right-click cycles the color.
//Press a key to clear, ESC to quit. Proves mouse position + buttons work.
U0 Paint()
{
  CDC *dc=DCAlias;
  I64 color=4,lastrb=0,ch;
  dc->color=color;

  //title bar
  GrRect(dc,0,0,640,16);  //(uses current color; just a banner stripe)
  dc->color=WHITE;
  GrPrint(dc,8,4,"Paint: move=cursor  hold=draw  right-click=color  key=clear");

  while (TRUE) {
    ch=ScanChar;
    if (ch==CH_ESC || ch==CH_SHIFT_ESC) break;
    if (ch) DCFill(dc);   //any key clears the canvas

    //right button cycles color (on the press edge)
    if (ms.rb && !lastrb) {
      color++;
      if (color>15) color=1;
    }
    lastrb=ms.rb;
    dc->color=color;

    //draw a brush blob while the left button is held
    if (ms.lb) {
      GrCircle(dc,ms.pos.x,ms.pos.y,6);
    } else {
      //otherwise just show a small cursor dot so you can see tracking
      GrPlot(dc,ms.pos.x,ms.pos.y);
    }

    //live coordinate readout
    dc->color=BLACK; GrRect(dc,0,464,200,16);
    dc->color=WHITE;
    GrPrint(dc,8,468,"x=");
    GrPrint(dc,40,468,"   y=");

    Sleep(8);
  }
  DCFill(dc);
}
Paint;

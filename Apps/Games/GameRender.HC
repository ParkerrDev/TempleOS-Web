U0 RenderChk()
{
  I64 i,j,hash;
  CDC *dc;
  Seed(1);Init;SkyRowsMake;
  dc=DCNew(640,480);
  for (j=0;j<3;j++) {
    RenderFaces(dc);
    DrawHUD(g_win,g_sw,g_sh,dc->width_internal);
    hash=0xCBF29CE484222325;
    for (i=0;i<640*480;i++)
      hash=(hash^dc->body[i])*0x100000001B3;
    "%016X\n",hash;
    g_yaw+=0.3;g_pitch+=0.1;
  }
  DCDel(dc);CleanUp;
}
RenderChk;

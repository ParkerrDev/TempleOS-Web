
#define DC_NUM	4

CDC *cafe_dc[DC_NUM];
F64 glbl_scale;

U0 RenderImage(CTask *,CDC *dc)
{
  dc->flags|=DCF_TRANSFORMATION;
  Mat4x4Scale(dc->r,glbl_scale);
  GrBlot3(dc,40,0,0,cafe_dc[winmgr.updates%DC_NUM]);
}

U0 InitImage(U8 *filename,F64 scale)
{
  I64 i;
  glbl_scale=scale;
  for (i=0;i<DC_NUM;i++)
    cafe_dc[i]=BMPRead(filename,TRUE);
}

U0 CleanUpImage()
{
  I64 i;
  //SettingsPop;
  
  for (i=0;i<DC_NUM;i++)
    DCDel(cafe_dc[i]);


}

U0 BMP24View(U8 *filename,F64 scale=1.0, CDC* dc,CTask *task)
{
  RenderImage(task,dc);
  
}



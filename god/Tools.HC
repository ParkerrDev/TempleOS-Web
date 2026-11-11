U0 GodToolOutput(U8 *name)
{//Keep the generated document after its popup task exits.
  I64 size;
  U8 *buf=DocSave(DocPut,&size),*filename;
  if (size>1) {
    filename=MStrPrint("C:/Home/%s%016X%016X.DD",name,Now,GetTSC);
    if (FileWrite(filename,buf,size)==size)
      "\nSaved to %s.\n",filename;
    else
      "\nCould not save %s.\n",filename;
    Free(filename);
  }
  Free(buf);
  if (size>1)
    View;
}

U0 GodToolDoodle(U8 *hex=NULL)
{
  U8 *elems;
  if (elems=GodDoodleSprite(hex)) {
    DocClear;
    Sprite(elems);
    Free(elems);
    GodToolOutput("GodDoodle");
  }
}

U0 GodToolSong()
{
  DocClear;
  GodSong;
  GodToolOutput("GodSong");
}

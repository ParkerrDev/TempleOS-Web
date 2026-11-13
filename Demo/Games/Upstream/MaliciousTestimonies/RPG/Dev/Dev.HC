U0 GrChar(CDC *dc=gr.dc,U8 ch,I64 x,I64 y,I64 scale){
  I64 i,j,k=0;
  for(i=0;i<FONT_HEIGHT;i++){
    for(j=0;j<FONT_WIDTH;j++){
      if(Bt(&text.font[ch],k++)){
        GrRect(dc,x+j*scale,y+i*scale,scale,scale);
      }
    }
  }
}

U0 PrintLine(CDC*dc=gr.dc,U8 *line,I64 startx,I64 starty,F64 scale=1){
 I64 factor = ToI64(scale*7);
 I64 i;
 for(i=0;i<StrLen(line);i++)
 {
  GrChar(dc,line[i],startx+(i*factor),
                    starty,scale);
 }

}

class DevConsole{

 CDC *cmd;
 U8 *line0;
 U8 *line1;
 U8 *line2;
 U8 *line3;
 U8 *line4;
 U8 *line5;
 U8 *line6;
 U8 *line7;
 U8 *line8;
 U8 *line9;
 U8 *line10;

} devc;



U0 InitDev()
{
 devc.line0 = StrNew("ÿ"); 
 devc.line1 = StrNew("V"); 
 devc.line2 = StrNew("|"); 
 devc.line3 = StrNew("|"); 
 devc.line4 = StrNew("|"); 
 devc.line5 = StrNew("|"); 
 devc.line6 = StrNew("|"); 
 devc.line7 = StrNew("you're debugging; in that case, good job!"); 
 devc.line8 = StrNew("Note this is technically cheating... unless"); 
 devc.line9 = StrNew("Please type in your command to begin."); 
 devc.line10 = StrNew("Welcome to the dev console"); 

}

CDC *RenderDev(){ 
 // blink
 // devc.line0 = MStrPrint("%s%s",devc.line0);
 // devc.line0[StrLen(devc.line0)-1]=char; 
 // devc.line0 = MStrPrint("%s%s",devc.line0); 
 // DCClear(devc.cmd);
 // DCRst(devc.cmd);
 // DCDepthBufRst(devc.cmd);
 devc.cmd = DCNew(400,140);
 DCFill(devc.cmd, WHITE);
 devc.cmd->color=BLACK;
 PrintLine(devc.cmd,devc.line0,10,124,1); 
 PrintLine(devc.cmd,devc.line1,10,112,1); 
 PrintLine(devc.cmd,devc.line2,10,100,1); 
 PrintLine(devc.cmd,devc.line3,10,88,1); 
 PrintLine(devc.cmd,devc.line4,10,76,1); 
 PrintLine(devc.cmd,devc.line5,10,64,1);
 PrintLine(devc.cmd,devc.line6,10,52,1);  
 PrintLine(devc.cmd,devc.line7,10,40,1);
 PrintLine(devc.cmd,devc.line8,10,28,1);  
 PrintLine(devc.cmd,devc.line9,10,16,1);
 PrintLine(devc.cmd,devc.line10,10,4,1);  
 return devc.cmd; 
}

U0 DevKeyEnter(){
 Free(devc.line10);
 devc.line10 = devc.line9;
 devc.line9 = devc.line8;
 devc.line8 = devc.line7;
 devc.line7 = devc.line6;
 devc.line6 = devc.line5;
 devc.line5 = devc.line4;
 devc.line4 = devc.line3;
 devc.line3 = devc.line2;
 devc.line2 = devc.line1;

 I64 newLen = StrLen(devc.line0);//minus new char (keep null char)
 U8 *myNewStr= MAlloc(newLen);
 MemCpy(myNewStr,devc.line0,newLen-1);
 myNewStr[newLen-1] = '\0'; 
 devc.line0 = MStrPrint("%s",myNewStr);

 if(StrCmp(devc.line0,"noclip")==0)
 {
  if(mc->clip)
   mc->clip=FALSE;
  else
   mc->clip=TRUE;
 }
 Free(myNewStr);

 devc.line1 = devc.line0;
 devc.line0 = StrNew("ÿ");//MStrPrint("",);
}

U0 AddDevChar(I64 buffer)
{
 I64 newLen = StrLen(devc.line0)+2;//plus new char and null char
 I64 insertLoc = StrLen(devc.line0);
 U8 *myNewStr= MAlloc(newLen);
 U8 convChar = ((U8)buffer);
 
 MemCpy(myNewStr,devc.line0,insertLoc);
 myNewStr[insertLoc-1] = convChar;
 myNewStr[insertLoc] = 'ÿ';
 myNewStr[insertLoc+1] = '\0';
 
 Free(devc.line0);
 devc.line0 = MStrPrint("%s",myNewStr);
 Free(myNewStr);

}

U0 DelDevChar()
{
 devc.line0[StrLen(devc.line0)-2]=0;
}

U0 PrintDevMessage(U8 *msg, Bool toFree=TRUE)
{
 Free(devc.line0);
 devc.line0 = MStrPrint("%s ",msg);
 if(toFree)
  Free(msg);
 DevKeyEnter;
}
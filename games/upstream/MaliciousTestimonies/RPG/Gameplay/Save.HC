class SaveFormat
{
U8  *saveFile;//[32]	format "$$DA-P,A=\"FileName:%s\"$$\n";
} saveFileFormat;  

class SaveFileData
{
 World *world;
 Actor *player;
};


#assert sizeof(SaveFileData)<=BLK_SIZE



U0 Quit()
{
  //free everything
 
  //free player
  FreeActor(0);
}



CDC *RenderSaveForm()
{
  CDC *ret = DCNew(400,200);
  DCFill(ret, WHITE);
  ret->color = BLACK;
  U8 *title = "Save File Name:";
  PrintLine(ret,title,0,0,1); 
  ret->color = LTGRAY;
  GrRect(ret,12,32,388,100);
  PrintLine(ret,saveFileFormat.saveFile,13,33,1); 

 return ret;

}
U0 ModifySaveBuffer(I64 buffer)
{
 I64 newLen = StrLen(saveFileFormat.saveFile)+2;//plus new char and null char
 I64 insertLoc = StrLen(saveFileFormat.saveFile);
 U8 *myNewStr= MAlloc(newLen);
 U8 convChar = ((U8)buffer);
 
 MemCpy(myNewStr, saveFileFormat.saveFile,insertLoc);
 myNewStr[insertLoc-1] = convChar;
 myNewStr[insertLoc] = 'ÿ';
 myNewStr[insertLoc+1] = '\0';
 //devc.line0 = myNewStr; 
 saveFileFormat.saveFile = MStrPrint("%s",myNewStr);


}

U0 SaveForm()
{
 saveFileFormat.saveFile = "ÿ";
 mc->displaySave =TRUE;
}



//
//Save and Load
//

U0 SaveFormReturn(Actor *p)
{
 //Save user input
 //StrCpy(&saveFileFormat,saveFileFormat.saveFile);

 //allocate file
 U8 *fileName = MStrPrint("%s%s%s","Saves/",saveFileFormat.saveFile,".BIN");
 CFile *file=FOpen(fileName,"w");
 SaveFileData *newSave= MAlloc(sizeof(SaveFileData));
 newSave->world = world;
 newSave->player = GetNPC(0);
 
 //prepare buffer
 U8 buffer[BLK_SIZE];
 U8 *ptr = buffer;
 I64 i,k,bytesWritten=0,sector=0,currentSize=sizeof(I64),currentStep=0;

 while(currentStep==0)
 {
  if(bytesWritten+currentSize<BLK_SIZE)
  {
    switch(currentStep)
    {
     case 0://player data
      //write currentZ
      MemCpy(ptr,&(newSave->world->currentZ),sizeof(I64)); 
      ptr+=sizeof(I64); bytesWritten+=sizeof(I64);
     
      //write player
      MemCpy(ptr,&(newSave->player->tribe),sizeof(U8)); 
      ptr+=sizeof(U8); bytesWritten+=sizeof(U8);
      MemCpy(ptr,&(newSave->player->face),sizeof(U8)); 
      ptr+=sizeof(U8); bytesWritten+=sizeof(U8);
      MemCpy(ptr,&(newSave->player->hair),sizeof(U8)); 
      ptr+=sizeof(U8); bytesWritten+=sizeof(U8);
      MemCpy(ptr,&(newSave->player->id),sizeof(I64)); 
      ptr+=sizeof(I64); bytesWritten+=sizeof(I64);
      MemCpy(ptr,&(newSave->player->hat),sizeof(I64)); 
      ptr+=sizeof(I64); bytesWritten+=sizeof(I64);
      MemCpy(ptr,&(newSave->player->armor),sizeof(I64)); 
      ptr+=sizeof(I64); bytesWritten+=sizeof(I64);
      MemCpy(ptr,&(newSave->player->sword),sizeof(I64)); 
      ptr+=sizeof(I64); bytesWritten+=sizeof(I64);
      MemCpy(ptr,&(newSave->player->ring1),sizeof(I64)); 
      ptr+=sizeof(I64); bytesWritten+=sizeof(I64);
      MemCpy(ptr,&(newSave->player->x),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->y),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->health),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->mana),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->str),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->int),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->con),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->wis),sizeof(U64)); 
      ptr+=sizeof(U64); bytesWritten+=sizeof(U64);
      MemCpy(ptr,&(newSave->player->status1),sizeof(U16)); 
      ptr+=sizeof(Bool); bytesWritten+=sizeof(U16);
      MemCpy(ptr,&(newSave->player->ai_script),sizeof(U8)); 
      ptr+=sizeof(U8); bytesWritten+=sizeof(U8);
//      MemCpy(ptr,&(newSave->player->myInv->maxWeight),sizeof(I32)); 
 //     ptr+=sizeof(I32); bytesWritten+=sizeof(I32);
      
      FBlkWrite(file,buffer,sector,BLK_SIZE);
      ptr-=bytesWritten; bytesWritten=0;
      sector++;
      currentStep++;
      break;/*
     case 1://write player inventory
      Item *toWrite = newSave->player->myInv->collection->next;
      
      for(i=0;i<InvNPCCount(&newSave->player);i++)
      {
       MemCpy(ptr,&(toWrite->name),sizeof(U8));//error? 
       ptr+=sizeof(U8); bytesWritten+=sizeof(U8);
       MemCpy(ptr,&(toWrite->weight),sizeof(F64)); 
       ptr+=sizeof(F64); bytesWritten+=sizeof(F64);
       MemCpy(ptr,&(toWrite->equip_slot),sizeof(I16)); 
       ptr+=sizeof(I16); bytesWritten+=sizeof(I16);
       MemCpy(ptr,&(toWrite->usable),sizeof(Bool));//error 
       ptr+=sizeof(Bool); bytesWritten+=sizeof(Bool);
       toWrite = toWrite->next;
      }
      FBlkWrite(file,buffer,sector,BLK_SIZE);
      ptr-=bytesWritten; bytesWritten=0;
      sector++;
      currentStep++;       
      break;*/
     case 2://TODOwrite world to save
      break;
    }
    

  }
  else
  {
   FBlkWrite(file,buffer,sector,BLK_SIZE);
   sector++;
   ptr-=bytesWritten;
   bytesWritten=0;
  }
 }

 //write and close
 //FBlkWrite(file,buffer,sector,1);
 FClose(file);
 Free(newSave);
 //Quit;
}


U0 LoadGame(U8 *file)
{
 CFile *load = FOpen(file,"r");
                                            
		      
 SaveFileData *newSave = MAlloc(sizeof(SaveFileData));
 newSave->world = world;
 newSave->player = GetNPC(0);

 U8 buffer[BLK_SIZE];
 U8 *ptr = buffer;
 I64 i=0, step=0,bytesRead=0;

 while(FBlkRead(load,buffer,BLK_SIZE*i,1)){
  switch(step)
  {
   case 0:
      MemCpy(&(newSave->world->currentZ),ptr,sizeof(I64)); 
      ptr+=sizeof(I64); bytesRead+=sizeof(I64);
      
      //write player
      MemCpy(&(newSave->player->tribe),ptr,sizeof(U8)); 
      ptr+=sizeof(U8); bytesRead+=sizeof(U8);
      MemCpy(&(newSave->player->face),ptr,sizeof(U8)); 
      ptr+=sizeof(U8); bytesRead+=sizeof(U8);
      MemCpy(&(newSave->player->hair),ptr,sizeof(U8)); 
      ptr+=sizeof(U8); bytesRead+=sizeof(U8);
      MemCpy(&(newSave->player->id),ptr,sizeof(I64)); 
      ptr+=sizeof(I64); bytesRead+=sizeof(I64);
      MemCpy(&(newSave->player->hat),ptr,sizeof(I64)); 
      ptr+=sizeof(I64); bytesRead+=sizeof(I64);
      MemCpy(&(newSave->player->armor),ptr,sizeof(I64)); 
      ptr+=sizeof(I64); bytesRead+=sizeof(I64);
      MemCpy(&(newSave->player->sword),ptr,sizeof(I64)); 
      ptr+=sizeof(I64); bytesRead+=sizeof(I64);
      MemCpy(&(newSave->player->ring1),ptr,sizeof(I64)); 
      ptr+=sizeof(I64); bytesRead+=sizeof(I64);
      MemCpy(&(newSave->player->x),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->y),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->health),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->mana),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->str),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->int),ptr,sizeof(U64));// 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->con),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->wis),ptr,sizeof(U64)); 
      ptr+=sizeof(U64); bytesRead+=sizeof(U64);
      MemCpy(&(newSave->player->status1),ptr,sizeof(U16)); 
      ptr+=sizeof(Bool); bytesRead+=sizeof(Bool);
      MemCpy(&(newSave->player->ai_script),ptr,sizeof(U8)); 
      ptr+=sizeof(U8); bytesRead+=sizeof(U8);
      //MemCpy(&(newSave->player->myInv->maxWeight),ptr,sizeof(I32)); 
      //ptr+=sizeof(I32); bytesRead+=sizeof(I32);
     /* SetNPC(MakeActor(newSave->player->id,
      newSave->player->tribe,
      newSave->player->hair,
      newSave->player->face, 
      newSave->player->hat,
      newSave->player->armor,
      newSave->player->sword,
      newSave->player->ring1,
      newSave->player->x,
      newSave->player->y,
      newSave->player->str,
      newSave->player->int,
      newSave->player->con,
      newSave->player->wis,
      newSave->player->ai_script));*/
      ptr-=bytesRead; bytesRead=0;
      i++;
      step++;
   break;
   default:
    i++;
   break;
  }
 }

 FClose(load);
 mc->currentMenu=1;
 mc->currentSong=0;
 
}


//


Item *MakeItem(I64 id){
 Item * build = CAlloc(sizeof(Item));
 build->id=id;
 build->invID = -1;
 build->visible = TRUE;
 build->w=1,build->h=1; //inv render and offsets
 build->wOff=0, build->hOff=0;
 build->v1=NULL,build->v2=NULL, build->v3=NULL;
 build->value=0;
 build->equip_slot=EQ_SLOT_NON;
 build->usable=FALSE;
 //blot (ground) details
 build->img       = NULL;
 build->blotSX    = 1.0;
 build->blotSY    = 1.0;
 build->blotXOff  = BLOT_X_DEFAULT;
 build->blotYOff  = BLOT_Y_DEFAULT;

 I64 i;
 // lookup template  
 for(i=0; i<TOTALITEMS;++i) {
  if(ItemTemplates[i].id == id) {
   ItemTemplate *t = &ItemTemplates[i];

   build->name       = t->name;
   build->equip_slot = t->equip_slot;
   build->value      = t->value;
   build->usable     = t->usable;

   build->w          = t->w;
   build->h          = t->h;
   build->wOff       = t->grWOff;
   build->hOff       = t->grHOff;

   build->v1         = t->v1;
   build->v2         = t->v2;
   build->v3         = t->v3;

   build->img        = t->img;
   build->blotSX     = t->blotSX;
   build->blotSY     = t->blotSY;
   build->blotXOff   = t->blotXOff;
   build->blotYOff   = t->blotYOff;
   break;
  }
 }

 return build;
}

Inventory *MakeInventory()
{
  I64 i,j;
  Inventory *newInv = MAlloc(sizeof(Inventory));
  //newInv->maxWeight = weight;
  Item *item_que = MAlloc(sizeof(Item));
  QueInit(item_que);
  QueIns(MakeItem(0),item_que->last);
  newInv->collection = item_que;
  newInv->count = 0;
  for(i=0;i<INVWIDTH;i++)
  {
   for(j=0;j<INVHEIGHT;j++)
   {
     newInv->mtrx[j][i].occupied =IT_NULL;
   }
  }

 //QueInit(p->myInv->collection);

 return newInv;
}

U0 FreeInventory(Inventory *inv)
{
 QueDel(inv->collection);
 Free(inv->collection);
 Free(inv);

}
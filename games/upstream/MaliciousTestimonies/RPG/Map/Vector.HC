//Vector Implementation
//Forked October 19th, 2023
//Author Austin Sierra for TempleOS Foundation
//Subject to Creative Commons BY-NC 4.0
//

class Path
{
 I64 f,g,h,x,y;
 Path *parent;
 Bool inOpenList, inClosedList;
};

//Vector Objection Declaration
public class Vector
{
 I32 size;
 MapNode **data;
 Path **node;
 
 
};//vectors

//Initialize Vector of size size
Vector *CreateVector(I32 size)
{
 I64 i;
 Vector *v = MAlloc(sizeof(Vector));
 v->size = size;
 v->data = CAlloc(sizeof(MapNode)*size);
 v->node = CAlloc(sizeof(Path)*size);
 
 for(i=0;i<size;i++)
 {
  //allocate MapNode
  v->data[i] = CAlloc(sizeof(MapNode));
  v->data[i]->bg = 0;
  v->data[i]->hasNPC = FALSE;
  v->data[i]->idNPC = IT_NULL;
  v->data[i]->isSolid = FALSE;

  v->data[i]->waterLvl = 0;
  v->data[i]->len = 0;
  v->data[i]->items = CAlloc(sizeof(NodeStuff));

  v->data[i]->hasObj = FALSE;
  v->data[i]->idObj = IT_NULL;
  v->data[i]->idInv = IT_NULL;
  QueInit(v->data[i]->items);

 //heuristic data
  v->node[i]= CAlloc(sizeof(Path));
  v->node[i]->parent = NULL;
  v->node[i]->f=0;  v->node[i]->g=0;  v->node[i]->h=0;  
  v->node[i]->x=0;  v->node[i]->y=0;
  v->node[i]->inClosedList=FALSE;  v->node[i]->inOpenList=FALSE;
 }

 return v;

}

//add furniture item data d to vector index i.
U0 SetVectorObj(Vector *v,I64 d,I32 i,
                Bool solid = TRUE,I64 inventoryID=IT_NULL)
{
 v->data[i]->idObj = d;
 v->data[i]->hasObj= TRUE;
 v->data[i]->isSolid =solid;
 v->data[i]->idInv = inventoryID;
 

}

U0 AddItem(MapNode *n, I64 id)
{
  NodeStuff *newObj = CAlloc(sizeof(NodeStuff));
  newObj->id = id;
  
  QueIns(newObj,n->items->last);
  n->len = n->len+1; 
}

NodeStuff *GetItem(MapNode *n,I64 index)
{
  NodeStuff *toBeRemoved = n->items->next;
  I64 i;
  for(i=0;i<index;i++)
  {
    toBeRemoved = toBeRemoved->next;
  }
 
  return toBeRemoved;
}

NodeStuff *PickUpItem(MapNode *n,I64 index)
{
  NodeStuff *toBeRemoved = n->items->next;
  I64 i;
  for(i=0;i<index;i++){
    toBeRemoved = toBeRemoved->next;
  } 
  QueRem(toBeRemoved);
  n->len = n->len-1;

  return toBeRemoved;
}
U0 ClearItem(MapNode *n,I64 index)
{
  NodeStuff *toBeRemoved = n->items->next;
  I64 i;
  for(i=0;i<index;i++)
  {
    toBeRemoved = toBeRemoved->next;
  }
 
  QueRem(toBeRemoved);
  Free(toBeRemoved);
  n->len = n->len-1; 
}

Bool *GetVectorSolid(Vector *v, I64 index)
{
  return v->data[index]->isSolid;
  
}

//Repalce Vector v1 data to value v2
U0 CopyVector(Vector *v1, Vector *v2)
{
 I64 i;
 if(v1->size != v2->size)
 {
   "Error:attempting to add vectors of different size.";
 }
 else
 {
  for(i=0;i<v1->size;i++)
  {
   v1->data[i] = v2->data[i];
  }
 }
}


//Set Vector v at data position i to value d
U0 SetVector(Vector *v,F64 d,I32 i)
{
 v->data[i]->bg = d; 

 switch(d)
 {
  case BG_ROCK_WALL:
  case BG_DK_GRAY:
  case SOLID_BG_GREEN:
  case BG_BUSH_WALL:
   v->data[i]->isSolid=TRUE;
   v->data[i]->waterLvl=0;
  break;
  case BG_CYAN:
  case BG_BLUE:
   v->data[i]->isSolid=FALSE;
   v->data[i]->waterLvl=3;
  break;
  default:
   v->data[i]->waterLvl=0;
  break;
 }
}

//flip Vector v solidity at data position i 
U0 FlipVectorSolid(Vector *v,I32 i)
{
  v->data[i]->isSolid=TRUE;

}

//Set Vector v at data position i to value d
U0 SetVectorNPC(Vector *v,I64 d,I32 i)
{

 v->data[i]->idNPC = d;
 v->data[i]->hasNPC = TRUE; 

}
//REMOVE Vector v at data position i to value d
U0 RemoveVectorNPC(Vector *v,I32 i)
{

 v->data[i]->idNPC = -1;
 v->data[i]->hasNPC = FALSE; 

}

//Set Vector v at data position i to value d
U0 SetVectorItem(Vector *v,I64 d,I32 i)
{

 AddItem(v->data[i],d); 
 

}


//Prints the data values of Vector v

U0 PrintVector(Vector *v)
{
  I32 i;
  "[";
  for(i=0;i<v->size;i++)
  {
    Print("%.2f",v->data[i]->bg);
    if(i<v->size-1){
      ", ";
    }
  }
  "]\n";
}


F64 GetVector(Vector *v, I32 i)
{
 return v->data[i]->bg;
}

I64 GetVectorObj(Vector *v, I32 i)
{
 if(v->data[i]->hasObj)
   return v->data[i]->idObj;
 else
   return -1;
}

I64 GetVectorInv(Vector *v, I32 i)
{
 return v->data[i]->idInv;
}

I64 GetVectorWaterLevel(Vector *v,I32 i)
{
 return v->data[i]->waterLvl; 
}

I64 GetVectorNPC(Vector *v, I32 i)
{
 if(v->data[i]->hasNPC)
   return v->data[i]->idNPC;
 else
   return -1;
}

MapNode* GetVectorItem(Vector *v, I32 i)
{
  return v->data[i];
}




//Free a created Vector v

U0 DestroyVector(Vector *v)
{
 I64 i,j;
 for(i=0;i<v->size;i++)
 {
  while(v->data[i]->len>-1)//delete head
  {
   ClearItem(v->data[i],0);
  }
  Free((v->data[i]->items));
  Free(v->data[i]);
 
   
 }
 Free(v->data);
 Free(v);

}
//CreateVector(2);
//Vector *v = CreateVector(2);
//PrintVector(v);
//DestroyVector(v);
//note: typecast is postfix, i.e. ToI64();
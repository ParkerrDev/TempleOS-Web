//Matrix Implementation
//Last Change July 19,2025
//Forked June 16th, 2023
//Author Austin Sierra for TempleOS Foundation
//Subject to Creative Commons BY-NC 4.0
#include "Map/Vector.HC";



//Matrix Object Declaration
public class Matrix
{
 I64 x,y;
 Vector *data;
 Matrix *next,*last;

};



//Initialize Matrix of size size
Matrix *CreateMatrix(I64 row,I64 col)
{

 I64 i,j, size;
 Matrix *m = MAlloc(sizeof(Matrix));
 Matrix *first = m;

 size = sizeof(Vector); 

 for(i=0;i<row;i++)
 {
   m->data = CreateVector(col);

   for(j=0;j<col;j++)
   {   
    m->x = row; m->y = col;
    SetVector(m->data,0,j);
   }   

   if(i!=row-1)
   {
    Matrix *temp = m;
    m->next=MAlloc(sizeof(Matrix));
    m= m->next;
    m->last =temp;
   }
   else
   {
    m->next=first;
    first->last = m;
   }
 }  
 return first;

}



//Set Matrix m at data position row to Vector d
U0 SetMatrixVector(Matrix *m,Vector *d, I64 row)
{
 try{ 
  I64 i=0;

  while(i<row)
  { 
   m = m->next;
   i++;   

  }

  Vector *vMS = m->data;
  I64 sz = d->size;
  I64 sz2 = vMS->size;
  if(sz!=sz2)
  {
   "Cannot Set Matrix Value to Matrix of Different Size";
   PutExcept;

  }  

  CopyVector(m->data,d);

 }
 catch{
   "Matrix Vector Location Out of Range";
   PutExcept;

 };

}


//Set Matrix m at data position row col to value d
U0 SetMatrix(Matrix *m,F64 d, I64 row,I64 col)
{
 try{ 
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;    

  }
   SetVector(m->data,d,col);
 }
 catch{
   "Matrix Location Out of Range";
   PutExcept;

 };

}
//Set Matrix m at data position row col to value d
U0 SetMatrixObj(Matrix *m,I64 d, I64 row,I64 col,
                Bool solid=TRUE,I64 inventoryID=IT_NULL)
{
 try{ 
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;    

  }
   SetVectorObj(m->data,d,col,solid,inventoryID);
 }
 catch{
   "Matrix Location Out of Range";
   PutExcept;

 };

}


//Set Matrix m at data position row col to value d
U0 SetMatrixNPC(Matrix *m,I64 d, I64 row,I64 col)
{
 try{ 
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;    

  }
   SetVectorNPC(m->data,d,col);
 }
 catch{
   "Matrix Location Out of Range";
   PutExcept;

 };

}

U0 RemoveMatrixNPC(Matrix *m, I64 row,I64 col)
{
 try{ 
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;    

  }
   RemoveVectorNPC(m->data,col);
 }
 catch{
   "Matrix Location Out of Range";
   PutExcept;

 };

}
//Set Matrix m at data position row col to value d
U0 SetMatrixItem(Matrix *m,I64 d, I64 row,I64 col)
{
 try{ 
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;    

  }
   SetVectorItem(m->data,d,col);
 }
 catch{
   "Matrix Location Out of Range";
   PutExcept;

 };

}

//Prints the data values of Matrix m
U0 PrintMatrix(Matrix *m)
{
  I64 i,j;
  "[";
  for(i=0;i<m->x;i++)
  { 
   for(j=0;j<m->y;j++)
   {
    F64 value = GetVector(m->data,j);
    Print("%.2f",value);
    if(j<m->y-1){
      ", ";
    }
   }
    if(i<m->x-1){
      ",\n ";
    }
   m = m->next;

  }
  " ]\n";
}

//returns the data value at position x,y in Matrix m
F64 GetMatrix(Matrix *m, I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

  return GetVector(m->data,col);
}

//returns the data value at position x,y in Matrix m
I64 GetMatrixObj(Matrix *m, I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

  return GetVectorObj(m->data,col);
}
//returns the data value at position x,y in Matrix m
I64 GetMatrixInv(Matrix *m, I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

  return GetVectorInv(m->data,col);
}


//returns the data value at position x,y in Matrix m
I64 GetMatrixNPC(Matrix *m, I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

  return GetVectorNPC(m->data,col);
}

I64 GetMatrixWaterLevel(Matrix *m,I64 row,I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

  return GetVectorWaterLevel(m->data,col);

}

//returns the data value at position x,y in Matrix m
MapNode *GetMatrixItem(Matrix *m, I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

  return GetVectorItem(m->data,col);
}

Bool GetMatrixSolid(Matrix *m, I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }
  return GetVectorSolid(m->data,col);

}

U0 FlipMatrixSolid(Matrix *m,I64 row, I64 col)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;

  }

 FlipVectorSolid(m->data,col);
}

//returns the Vector at row x.
Vector *GetMatrixVector(Matrix *m, I64 row)
{
  I64 i=0;
  while(i<row)
  { 
   m = m->next;
   i++;  
  }
  return m->data;

}


//Free a created Matrix m
U0 DestroyMatrix(Matrix *m)
{
 I64 i;
 for(i =0;i<m->x;i++)
 {
   Vector *v = m->data;
   DestroyVector(v);
   m = m->last;
   Free(m->next);
 }

}

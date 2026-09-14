//Matrix Implementation
//Last Change April 17th, 2023
//Author Austin Sierra for Church of AIChrist
//Subject to Creative Commons BY-NC 4.0
#include "Vector.HC";


//Matrix Object Declaration
public class Matrix
{
 I64 x,y;
 Vector *data;
 Matrix *next,*last;
};

//Initialize Matrix of size size
Matrix *CreateMatrix(I64 _x,I64 _y)
{
 I64 i,j, size;
 Matrix*m = MAlloc(sizeof(Matrix));
 Matrix*first = m;
 
 size = sizeof(Vector);
 
 for(i=0;i<_x;i++)
 {
   m->data = CreateVector(_y);
   for(j=0;j<_y;j++)
   {
   
    m->x = _x; m->y = _y;
    SetVector(m->data,j,0);
 
   }
   
   if(i!=_x-1)
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


//Set Matrix m at data position i to value d
U0 SetMatrix(Matrix *m,I64 x_,I64 y_, F64 d)
{
 try{ 
  I64 i=0;
  while(i<x_)
  { 
   m = m->next;
   i++;
    
  }
   SetVector(m->data,y_,d);
 }
 catch{
   "Matrix Location Out of Range";
   PutExcept;
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
F64 GetMatrix(Matrix *m, I64 x, I64 y)
{
  I64 i=0;
  while(i<y)
  { 
   m = m->next;
   i++;
    
  }
  return GetVector(m->data,x);
}

//Add two matrix of the same size
Matrix *AddMatrix(Matrix *m1, Matrix *m2)
{
  I64 mX, mY;
  if(m1->x != m2->x || m1->y != m2->y){
    "Error: attempt to add matrixes of different size.";
    return m1;
  }
  else
  {
    Matrix *sum = CreateMatrix(m1->x,m1->y);
    for(mX=0;mX<m1->x;mX++)
    {
      for(mY=0;mY<m1->y;mY++)
      {
$IV,0$$IV,0$$IV,1$$IV,0$  $IV,1$$IV,0$     SetMatrix(sum,m$IV,0$X,mY,GetMatrix(m1,mX,mY)+GetMatrix(m2,mX,mY));
$IV,0$      }
$IV,0$    }
$IV,0$    return sum;
$IV,0$  }
}
//Subtract two matrix of the same size
$IV,1$$IV,0$Matrix *SubMatrix(Matrix *m1, Matrix *m2)
{
  I64 mX, mY;
  if(m1->x != m2->x || m1->y != m2->y){
    "Error: attempt to subtract matrixes of different size.";
    return m1;
  }
$IV,0$  else
$IV,0$  {
$IV,0$    Matrix *dif = CreateMatrix(m1->x,m1->y);
$IV,0$    for(mX=0;mX<m1->x;mX++)
$IV,0$    {
$IV,0$     for(mY=0;mY<m1->y;mY++)
     {
       SetMatrix(dif,mX,mY,GetMatrix(m1,mX,mY)-GetMatrix(m2,mX,mY));
     }
      
    }
    return dif;
  }
$IV,1$$IV,0$}


$IV,0$
//Calculate the dot product of two Matrix m1 and m2
F64 MultiplyMatrix(Matrix *m1, Matrix *m2)
{
  if(m1->y != m2->x)
  {
    "Error: attempt for matrix multiplication of unknown size.";
    return m1;
  }
  else
  {
    Matrix *product = CreateMatrix(m1->x,m2->y);
    I64 pX,pY,sums; 
 
    for(pX=0;pX<product->x;pX++)
    {
      for(pY=0;pY<product->y;pY++)
      {
         F64 currentProduct = 0;
         //sums holds the index value of the
         //current row/column product (that gets added across the integral)
         for(sums=m1->y;sums!=0;sums--)
         {
           currentProduct += GetMatrix(m1,pX,m1->y-sums)*GetMatrix(m2,m2->x-sums,pY);

$IV,0$$IV,0$$IV,0$         }

         SetMatrix(product,pX,pY,currentProduct);
  
      }

      
    }
    return product;
  }
}

$IV,0$Matrix *ScaleMatrix(Matrix *m, F64 scalar)
{
  Matrix* scaled = CreateMatrix(m->x,m->y);
  I64 mX,mY;
  for(mX =0;mX<m->x;mX++){
    for(mY =0;mY<m->y;mY++){
      SetMatrix(scaled,mX,mY,GetMatrix(m,mX,mY)*scalar);
    }
  }
  return scaled;
}

//Free a created Matrix m
U0 DestroyMatrix(Matrix *m)
{
 I64 i;
 for(i =m->x-1;i!=0;i--)
$IV,0$ {
   DestroyVector(m->data);
   m = m->last;
   Free(m->next);
 }
}

//Main to demo matrix
U0 MainMatrix()
{
  I32 matrixSizeX = 3, matrixSizeY = 2;
  Matrix *m1= CreateMatrix(matrixSizeX,matrixSizeY);
  Matrix *m2= CreateMatrix(matrixSizeY,matrixSizeX);
Matrix *m3= CreateMatrix(matrixSizeY,matrixSizeY);
Matrix *m4= CreateMatrix(matrixSizeY,matrixSizeY);
 
 $IV,0$ "m1 = \n";
  SetMatrix(m1,0,0,1);
  SetMatrix(m1,0,1,1);
  SetMatrix(m1,1,0,2);    
  SetMatrix(m1,1,1,3);
  SetMatrix(m1,2,0,5);
  SetMatrix(m1,2,1,8);
  PrintMatrix(m1);

 
  
  "\nm2 = \n";
  SetMatrix(m2,0,0,2);
  SetMatrix(m2,0,1,2);
  SetMatrix(m2,0,2,4);    
  SetMatrix(m2,1,0,4);
  SetMatrix(m2,1,1,8);
  SetMatrix(m2,1,2,8);
  PrintMatrix(m2);

  "\nm2 * 2 =\n";
  PrintMatrix(ScaleMatrix(m2,2));
  "\nm1 * m2 = \n";
  PrintMatrix(MultiplyMatrix(m1,m2));
  DestroyMatrix(m1);
  DestroyMatrix(m2);
 
"\nm3 = \n";
  SetMatrix(m3,0,0,1);
  SetMatrix(m3,0,1,3);
  SetMatrix(m3,1,0,2);    
  SetMatrix(m3,1,1,4);
  PrintMatrix(m3);

 
  
"\nm4 = \n";
  SetMatrix(m4,0,0,4);    
  SetMatrix(m4,0,1,2);
  SetMatrix(m4,1,0,3);
  SetMatrix(m4,1,1,1);
  PrintMatrix(m4);
"\nm3 - m4:\n";
  PrintMatrix(SubMatrix(m3,m4)); 
  
  DestroyMatrix(m3);
  DestroyMatrix(m4); 

}$IV,0$$IV,0$$IV,0$
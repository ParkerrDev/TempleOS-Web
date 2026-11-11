#define TM_TICK_HZ	35
#define TM_LUMPS_NUM	8192
#define TM_LUMP_SIZE	0x1000000
#define TM_NF_SUBSECTOR	0x8000
#define TM_TRANSPARENT	256
#define TM_CACHE_SIZE	0x800000

class Lump
{
  U32 offset,size;
  U8 name[8];
};

class Wad
{
  CFile *file;
  I64 size,cnt,read_bytes;
  Lump *dir;
};

class Vertex
{
  I16 x,y;
};

class Line
{
  U16 v1,v2,flags,special,tag,side[2];
};

class Side
{
  I16 x,y;
  U8 upper[8],lower[8],middle[8];
  U16 sector;
};

class Sector
{
  I16 floor,ceil;
  U8 floor_name[8],ceil_name[8];
  I16 light;
  U16 special,tag;
};

class Seg
{
  U16 v1,v2,angle,line,side,offset;
};

class Subsector
{
  U16 cnt,first;
};

class Node
{
  I16 x,y,dx,dy,box[2][4];
  U16 child[2];
};

class Thing
{
  I16 x,y,angle;
  U16 type,flags;
};

class Map
{
  Vertex *vertex;
  Line *line;
  Side *side;
  Sector *sector;
  Seg *seg;
  Subsector *subsector;
  Node *node;
  Thing *thing;
  I16 *blockmap;
  U8 *reject;
  I64 vertex_cnt,line_cnt,side_cnt,sector_cnt,seg_cnt,subsector_cnt,
	node_cnt,thing_cnt,blockmap_cnt,reject_size,lump,bytes;
  I64 *subsector_sector;
};

class Image
{
  I64 width,height,left,top;
  U16 *pix;
};

class TexDef
{
  U8 name[8];
  U32 masked;
  U16 width,height;
  U32 unused;
  U16 cnt;
};

class TexPatch
{
  I16 x,y;
  U16 patch;
  I16 step,color;
};

class Texture
{
  TexDef *def;
  Image *image;
  I64 stamp;
};

class Graphics
{
  Wad *wad;
  U8 *pnames,*tex1,*tex2,*colormap;
  I64 patch_cnt,tex_cnt,cache_size,stamp;
  Texture *texture;
};

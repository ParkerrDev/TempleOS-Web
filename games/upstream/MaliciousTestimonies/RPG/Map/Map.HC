
//Ground Nodes and their Player, Item, Object,Background Arrays


class NodeStuff:CQue
{
  I64 id;
};

class MapNode
{
 F64 bg;
 Bool isSolid, hasNPC, hasObj;
 I64 idNPC,idObj,idInv;
 I64 waterLvl, len;
 NodeStuff *items;
  
};


#define INVWIDTH	11
#define INVHEIGHT	4
//items
#define IT_NULL		-1
#define IT_FIST		0 //nothing
#define IT_DAGGER 	1
static CDC*		ITEM1= FramePtr("ITEM008"); //dagger
static CDC*		ITEM1I = FramePtr("WINV001");

#define IT_HARPOON	2
static CDC*	        ITEM2 = FramePtr("ITEM004");// harpoon
static CDC*		ITEM2I = FramePtr("WINV015");

#define IT_TOOTH 	3
static CDC*		ITEM3=DCNew(100,100); //wolf tooth
static CDC*		ITEM3I=DCNew(100,100);

#define IT_FISH1        4
static CDC*		ITEM4I = FramePtr("ITEM164");//fish

#define IT_HELM         5
static CDC*             ITEM5= FramePtr("ITEM032");
static CDC*             ITEM5I= FramePtr("ARMR012");

#define IT_SHIRT        6
static CDC*             ITEM6= FramePtr("ITEM044");
static CDC*             ITEM6R= FramePtr("ITEM044R");
static CDC*             ITEM6G= FramePtr("ITEM044G");
static CDC*             ITEM6B= FramePtr("ITEM044B");
static CDC*             ITEM6P= FramePtr("ITEM044P");
static CDC*             ITEM6I= FramePtr("CLOT012");
static CDC*             ITEM6IR= FramePtr("CLOT012R");
static CDC*             ITEM6IG= FramePtr("CLOT012G");
static CDC*             ITEM6IB= FramePtr("CLOT012B");
static CDC*             ITEM6IP= FramePtr("CLOT012P");

#define IT_BULB 	7
static CDC*		ITEM7=DCNew(100,100); //poppy bulb
static CDC*		ITEM7I=DCNew(100,100);

#define IT_POT	 	8
static CDC*		ITEM8=DCNew(100,100); 
static CDC*		ITEM8I=DCNew(100,100);

#define IT_WPOT 	9
static CDC*		ITEM9=DCNew(100,100); 
static CDC*		ITEM9I=DCNew(100,100);

#define IT_HPPOT 	10
static CDC*		ITEM10= FramePtr("ITEM070");
static CDC*		ITEM10I=DCNew(100,100);

#define IT_OLIVEBRANCH  11
#define IT_SHIRTR       12
#define IT_SHIRTG       13
#define IT_SHIRTB       14
#define IT_SHIRTP       15

#define IT_SHEKEL       16
static CDC*             ITEM16= FramePtr("ITEM205");
#define IT_SHEKEL2      17
static CDC*             ITEM17= FramePtr("ITEM071");
#define IT_SHEKEL10     18
static CDC*             ITEM18= FramePtr("ITEM147");
#define IT_SHEKEL100    19
static CDC*             ITEM19= FramePtr("ITEM095");

#define IT_BRZSWORD     20
static CDC*		ITEM20 = FramePtr("ITEM001B");
static CDC*		ITEM20I = FramePtr("WINV006");

#define IT_HAMMER       21
static CDC*		ITEM21 = FramePtr("ITEM019");
static CDC*		ITEM21I = FramePtr("WINV012");

#define IT_HATCHET      22
static CDC*	 	ITEM22 = FramePtr("ITEM030");
static CDC*		ITEM22I = FramePtr("WINV101");
#define WEAPONCOUNT     6
//special
#define SP_FISHING_SPOT 999
static CDC*		SPECIAL1 = FramePtr("EFF075");//special point
static CDC*		SPECIAL2 = FramePtr("EFF076");
static CDC*             ITEM048 = FramePtr("ITEM048");//boots
static CDC*             ITEM142 = FramePtr("ITEM142");//up sign


//prayers
#define SP_HEAL	0
static CDC* ITEM050= FramePtr("ITEM050");


//Tile Codes
#define BG_GREEN	0
#define BG_BLUE		1
#define BG_CYAN		2
#define BG_BROWN	3
#define BG_YELLOW	4
#define BG_LT_GRAY	16
#define BG_DK_GRAY	17
#define BG_LT_RED	18
#define BG_ROCK_WALL    19
#define BG_BUSH_WALL    20
#define BG_GRASS        21
#define SOLID_BG_GREEN	110

class ItemTemplate {
  I16 id;

  U8 *name;
  I16 equip_slot;
  I16 value;
  Bool usable;

  U8  w, h;
  I16 grWOff, grHOff; // ground offsets (wOff/hOff)

  U8 *v1, *v2, *v3;

  CDC *img;            // world/equipped sprite
  F64 blotSX, blotSY;  // world render scale
  I16 blotXOff, blotYOff; // world render offsets
};

// defaults used in old BlotItem
#define BLOT_X_DEFAULT  (-2)
#define BLOT_Y_DEFAULT  (302)

#define EQ_SLOT_NON	0
#define EQ_SLOT_WEP	1
#define EQ_SLOT_BDY	2
#define EQ_SLOT_HLM	3
#define EQ_SLOT_RNG	4

#define INVWIDTH 11
#define INVHEIGHT 4
#define TOTALITEMS 23
static ItemTemplate ItemTemplates[TOTALITEMS] = {
  // NULL / FIST -> Bag
  {
    IT_NULL,
    "Bag",
    EQ_SLOT_NON,
    0, FALSE,
    1,1, 0,0,
    NULL,NULL,NULL,
    NULL, 1.0,1.0, BLOT_X_DEFAULT,BLOT_Y_DEFAULT
  },
  {
    IT_FIST,
    "Bag",
    EQ_SLOT_NON,
    0, FALSE,
    1,1, 0,0,
    NULL,NULL,NULL,
    NULL, 1.0,1.0, BLOT_X_DEFAULT,BLOT_Y_DEFAULT // no sprite (unarmed)
  },

  // Dagger
  {
    IT_DAGGER,
    "Crude Dagger",
    EQ_SLOT_WEP,
    7, FALSE,
    1,2, 20,50,      // inventory size/ground offset
    "STR+2", NULL, NULL,
    ITEM1I, 1.0,1.0, 4, BLOT_Y_DEFAULT
  },

  // Harpoon
  {
    IT_HARPOON,
    "Harpoon",
    EQ_SLOT_WEP,
    12, FALSE,
    1,3, 25,15,// inventory size/ground offset
    "STR+1", "CON+1", "Fishing Tool",
    ITEM2I, 1.0,1.0, BLOT_X_DEFAULT, 302
  },

  // Wolf fang
  {
    IT_TOOTH,
    "Wolf fang",
    EQ_SLOT_NON,
    2, FALSE,
    1,1, 0,0,// inventory size/ground offset
    NULL,NULL,NULL,
    ITEM3I, 1.0,1.0, BLOT_X_DEFAULT, BLOT_Y_DEFAULT
  },

  // Raw Carp
  {
    IT_FISH1,
    "Raw Carp",
    EQ_SLOT_NON,
    1, TRUE,
    1,2, 0,32,// inventory size/ground offset
    "SP+10", "Ingredient", NULL,
    ITEM4I, 1.0,1.0, BLOT_X_DEFAULT, 312
  },

  // Iron Helm
  {
    IT_HELM,
    "Iron Helm",
    EQ_SLOT_HLM,
    25, FALSE,
    2,2, 0,32,// inventory size/ground offset
    "CON+1", "HP+10", "WIS-1",
    ITEM5I, 0.5,0.5, 8,312
  },

  // Tunics (Brown / R / G / B / P) – all share same blot scale/ground offset
  {
    IT_SHIRT,
    "Brown Tunic",
    EQ_SLOT_BDY,
    5, FALSE,
    2,3, 0,32,// inventory size/ground offset
    "HP+10", "SP+10", NULL,
    ITEM6I, 0.9,0.9, BLOT_X_DEFAULT-2, 312
  },
  {
    IT_SHIRTR,
    "Red Tunic",
    EQ_SLOT_BDY,
    60, FALSE,
    2,3, 0,32,
    "HP+10", "SP+10", NULL,
    ITEM6IR, 0.9,0.9, BLOT_X_DEFAULT-2, 312
  },
  {
    IT_SHIRTG,
    "Green Tunic",
    EQ_SLOT_BDY,
    10, FALSE,
    2,3, 0,32,
    "HP+10", "SP+10", NULL,
    ITEM6IG, 0.9,0.9, BLOT_X_DEFAULT-2, 312
  },
  {
    IT_SHIRTB,
    "Blue Tunic",
    EQ_SLOT_BDY,
    15, FALSE,
    2,3, 0,32,
    "HP+10", "SP+10", NULL,
    ITEM6IB, 0.9,0.9, BLOT_X_DEFAULT-2, 312
  },
  {
    IT_SHIRTP,
    "Purple Tunic",
    EQ_SLOT_BDY,
    1500, FALSE,
    2,3, 0,32,// inventory size/ground offset
    "HP+10", "SP+10", NULL,
    ITEM6IP, 0.9,0.9, BLOT_X_DEFAULT-2, 312
  },

  // Poppy Bulb
  {
    IT_BULB,
    "Poppy Bulb",
    EQ_SLOT_NON,
    1, FALSE,
    1,1, 0,32,
    "Alchemy Ingredient", NULL, NULL,
    ITEM7I, 1.0,1.0, BLOT_X_DEFAULT, 300
  },

  // Pots
  {
    IT_POT,
    "Clay Pot",
    EQ_SLOT_NON,
    1, FALSE,
    2,2, 10,50,
    "Crafting Reagent", NULL, NULL,
    ITEM8I, 1.0,1.0, 12,315
  },
  {
    IT_WPOT,
    "Water Pot",
    EQ_SLOT_NON,
    1, FALSE,
    2,2, 10,50,// inventory size/ground offset
    "Crafting Reagent", NULL, NULL,
    ITEM9I, 1.0,1.0, 12,315
  },
  {
    IT_HPPOT,
    "Poppy Decoction",
    EQ_SLOT_NON,
    4, TRUE,
    2,2, 10,50,
    "HP+25", NULL, NULL,
    ITEM10I, 1.0,1.0, 12,315
  },

  // Coins
  {
    IT_SHEKEL,
    "Silver Shekel",
    EQ_SLOT_NON,
    1, FALSE,
    1,1, 0,32,// inventory size/ground offset
    NULL,NULL,NULL,
    ITEM16, 1.0,1.0, BLOT_X_DEFAULT, 296
  },
  {
    IT_SHEKEL2,
    "Silver Shekels",
    EQ_SLOT_NON,
    2, FALSE,
    1,1, 0,32,
    NULL,NULL,NULL,
    ITEM17, 1.0,1.0, BLOT_X_DEFAULT, 298
  },
  {
    IT_SHEKEL10,
    "Bag of Silver",
    EQ_SLOT_NON,
    10, FALSE,
    2,1, 0,32,
    NULL,NULL,NULL,
    ITEM18, 1.0,1.0, 24,296
  },
  {
    IT_SHEKEL100,
    "Chest of Silver",
    EQ_SLOT_NON,
    100, FALSE,
    2,2, 0,32,
    NULL,NULL,NULL,
    ITEM19, 1.2,1.2, 16,308
  },

  // Bronze Sword
  {
    IT_BRZSWORD,
    "Bronze Sword",
    EQ_SLOT_WEP,
    25, FALSE,
    1,2, 25,15,// inventory size/ground offset
    "STR+2", "CON+1", NULL,
    ITEM20I, 1.0,1.0, 4, BLOT_Y_DEFAULT
  },

  // Hammer
  {
    IT_HAMMER,
    "Crude Hammer",
    EQ_SLOT_WEP,
    35, FALSE,
    1,3, 25,15,// inventory size/ground offset
    "STR+3", NULL, NULL,
    ITEM21I, 1.0,1.0, 4, BLOT_Y_DEFAULT
  },

  // Hatchet
  {
    IT_HATCHET,
    "Crude Axe",
    EQ_SLOT_WEP,
    20, FALSE,
    1,2, 25,15,
    "STR+1", "CON+2", NULL,
    ITEM22I, 1.0,1.0, 4, BLOT_Y_DEFAULT
  },
};

//Item is the initialized class that gets populated by an 
//ItemTemplate, which contains the static 'item data'
class Item:CQue
{
  U8* name;
  //name appears in tooltip
  I16 equip_slot, id, invID, value;
  //equip slot determines equippable helm, body, ring, wep (or none)
  //id is the item id (generic)
  //invID is for differentiating the same item in players inv
  //value refers to silver cost
  Bool usable, visible;
  //usable determines selection option from prayer menu 
  //visible is used to toggle item when dragging
  U8 w, h, wOff,hOff;
  //w and h are in inventory boxes width and height
  //wOff and hOff refer to screen location offset relative to inventory position
  U8* v1,*v2,*v3;
  //these variables optionally appear in tooltip description
  // ---- blot / world render data ----
  CDC *img;           // base sprite
  F64 blotSX, blotSY; // scale for world/equipped render
  I16 blotXOff;       // world/equipped x offset (BlotItems xoff)
  I16 blotYOff;       // world/equipped y offset (BlotItems yoff)
};

class ItemNode
{
 I8 occupied;

};


class Inventory
{
  I64 count;  
  Item *collection;
  ItemNode mtrx[4][11]; 
};


//
//Prayer Globals
//
class Prayer
{
  U8 *name,*desc;
  I64 id, type, cost, wOff, hOff;
  Bool unlocked;
};

#define MAX_PRAYERS	42

class Prayers
{
  Prayer **list;
  I64 points,filter,unlocked; 
};

#define TYPE_M		0
#define TYPE_W		1
#define TYPE_P		2
#define TYPE_A		3



//		  //
// End Tile Codes //
//		  //


U8 *GetBG(I64 id)
{
  U8 *color = BLUE; 
  switch(id)
  {
   case BG_BUSH_WALL:
   case SOLID_BG_GREEN:
   case BG_GREEN:
   case BG_GRASS:
    color = GREEN;
   break;
   case BG_BLUE:
    color = BLUE;
   break;
   case BG_CYAN:
    color = CYAN;
   break;
   case BG_BROWN:
    color = BROWN;
   break;
   case BG_YELLOW:
    color = YELLOW;
   break;
   case BG_LT_GRAY:
    color = LTGRAY;
   break;
   case BG_DK_GRAY:
    color = DKGRAY;
   break;
   case BG_LT_RED:
    color = LTRED;
   break;
   default:
    color = BLACK;
   break;


  }
  return color;
}
F64 map_range(F64 w, F64 a, F64 b, F64 newWL, F64 newWU) {
    return newWL + (w - a) * (newWU - newWL) / (b - a);
}


I64 ScreenPToTile(I64 sx, I64 lb, I64 ub)
{ 
 return ToI64(map_range(ToF64(sx), 0.0, 480.0, ToF64(lb+1),ToF64(ub-5)));
}



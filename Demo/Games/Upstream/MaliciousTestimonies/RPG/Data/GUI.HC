#define BTN_EQUIP      1
#define BTN_STATS      2
#define BTN_INV        3
#define BTN_RUN        4
#define BTN_ORB        5
#define BTN_PRAYER     6
#define BTN_MUSIC      7
#define BTN_FX         8
#define BTN_EQUIP_X    9
#define BTN_INV_X      10
#define BTN_SUBMENU_X 11
#define BTN_SAVE      12
#define BTN_C_MOVE    13
#define BTN_C_STRIKE  14
#define BTN_C_PRAYER  15
#define BTN_C_FLEE    16

#define CLICKREGIONS 16

#define EQREGIONS   4

#define EQ_SLOT_SWORD  1
#define EQ_SLOT_HELM   2
#define EQ_SLOT_BODY   3
#define EQ_SLOT_RING   4

#define LOOT_TAKEALL_X1 494
#define LOOT_TAKEALL_Y1 40
#define LOOT_TAKEALL_X2 494 + 128
#define LOOT_TAKEALL_Y2 40 + 48

//Window Flags
#define REQ_NO_STATS    1
#define REQ_NO_PRAYERS  2
#define REQ_EQUIP_OPEN  4
#define REQ_INV_OPEN    8

//TODO: implement window objects:Unused (yet)
class GraphicObject
{
  U8 *title;
  I64 relX, relY;
  I64 screenX, screenY; 
  U8 *onClickFunctionPtr;
  U8 *onReleaseFunctionPtr;
  U8 *sprite; 

};

class TextObject
{
  U8 *title;
  I64 relX, relY;
  I64 screenX, screenY;
  I64 fontSize; 
  U8 *value; 
};

class GameMenu
{
  GraphicObject *buttons[10];
  TextObject *texts[10];
  U8 X, Y;  
};

//begin 

static class ClickRegion {
 I64 x1, y1, x2, y2;
 I64 id;
 I64 flags;
} sideBarButtons[CLICKREGIONS] = {
 {496,  40, 549, 100, BTN_EQUIP,0},
 {550,  40, 610, 100, BTN_STATS,0},
 {496, 100, 549, 160, BTN_INV,0},
 {494, 160, 549, 220, BTN_RUN,0},
 {550, 160, 610, 220, BTN_ORB,0},
 {550, 100, 603, 160, BTN_PRAYER,0},
 {494, 220, 549, 280, BTN_MUSIC,0},
 {550, 220, 610, 280, BTN_FX,0},
 {140,  10, 180,  40, BTN_EQUIP_X,0},
 {450, 290, 480, 310, BTN_INV_X,0},
 {580,   0, 641,  40, BTN_SUBMENU_X,0},
 {496, 421, 619, 458, BTN_SAVE,0},
 {0,   290, 199, 420, BTN_C_MOVE,0},
 {200, 290, 400, 420, BTN_C_STRIKE,0},
 {0,   420, 199, 480, BTN_C_PRAYER,0},
 {200, 420, 400, 480, BTN_C_FLEE,0},

};

U0 BuildEquipRegions(ClickRegion *regions)
{
 regions[0].x1 = 8;
 regions[0].y1 = 116;
 regions[0].x2 = 60;
 regions[0].y2 = 116 + (3 * camera->dividY);
 regions[0].id = EQ_SLOT_SWORD;
 regions[0].flags = 0;

 regions[1].x1 = 18;
 regions[1].y1 = 44;
 regions[1].x2 = 102;
 regions[1].y2 = 127;
 regions[1].id = EQ_SLOT_HELM;
 regions[1].flags = 0;

 regions[2].x1 = 71;
 regions[2].y1 = 159;
 regions[2].x2 = 154;
 regions[2].y2 = 284;
 regions[2].id = EQ_SLOT_BODY;
 regions[2].flags = 0;

 regions[3].x1 = 117;
 regions[3].y1 = 52;
 regions[3].x2 = 157;
 regions[3].y2 = 91;
 regions[3].id = EQ_SLOT_RING;
 regions[3].flags = 0;
}
Bool InRect(I64 mx, I64 my, I64 x1, I64 y1, I64 x2, I64 y2)
{
 if(mx >= x1 && mx <= x2 &&my >= y1 && my <  y2)
  return TRUE;
 return FALSE;
}

Bool InGameArea(I64 mx, I64 my){
 return InRect(mx, my, 0, 0, 480, 480);
}

Bool RegionEnabled(ClickRegion *r)
{
 if((r->flags & REQ_NO_STATS) && mc->displayStats)
  return FALSE;
 if((r->flags & REQ_NO_PRAYERS) && mc->displayPrayers)
  return FALSE;
 if((r->flags & REQ_EQUIP_OPEN) && !mc->displayEquipment)
  return FALSE;
 if((r->flags & REQ_INV_OPEN) && !mc->displayInventory)
  return FALSE;
 return TRUE;
}

I64 FindClickRegion(ClickRegion *regions, I64 count, I64 mx, I64 my)
{
 I64 k;
 for(k = 0; k < count; k++){
  if(InRect(mx, my,
            regions[k].x1, regions[k].y1,
            regions[k].x2, regions[k].y2)){
   return regions[k].id;
  }
 }
 return 0;
}
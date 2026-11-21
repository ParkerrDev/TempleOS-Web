//After Davis. The rooms and puzzles are imagined scenes from a working life.
#define AD_TITLE 0
#define AD_WALK  1
#define AD_BENCH 2
#define AD_BOOK 4
#define AD_AIR   5
#define AD_END	 3

class CADJourney
{
  I64 stamp,room,x,y,bag,done,secrets,dials[3],tape;
};

CADJourney ad;
I64 ad_mode,ad_page,ad_step,ad_knob,ad_from,ad_code,ad_border;
CDC *ad_bg[4],*ad_actor[4],*ad_photo;
Bool ad_print;
U8 *ad_rooms[4]={"Desk","Booth","Spring","Temple"};
U8 *ad_titles[4]={"TAPE HEAD","ADMIT ONE","THE DRY SPAN","THE FOUR LABELS"};
U8 *ad_years[4]={"Teenage years","1990-1996","The LoseThos years","2013-2017"};
U8 *ad_stations[12]={"Cassette shelf","Commodore","Window sill",
      "Paper roll","Ticket press","Turnstile","Spring","Balance arm",
      "Stone arch","Bell","Workbench","Open door"};
U8 *ad_items[4]={"Cassette","Ticket stub","Plumb bob","Blank label"};
U8 *ad_line,*ad_line2;
I64 ad_bits[9]={4,14,31,13,28,56,112,224,64};
U8 *ad_names[4]={"SparrowOS","TempleOS","J OS","LoseThos"};

U0 AdSay(U8 *a,U8 *b="")
{
  ad_line=a;
  ad_line2=b;
}

I64 AdSpot()
{
  if (ad.x<210)
    return 0;
  if (ad.x>404)
    return 2;
  return 1;
}

U0 AdEnter(I64 room)
{
  ad.room=room;ad.x=85;ad.y=291;
  ad_mode=AD_WALK;ad_knob=0;
  switch (room) {
    case 0:
      AdSay("The tape deck clicks off. Nine stripes sit on the screen.",
	    "One wing points through the glass. The other points at you.");
      break;
    case 1:
      AdSay("Doors in ten minutes. The press keeps eating the first seat.",
	    "A length of spoiled tickets curls under the counter.");
      break;
    case 2:
      AdSay("In this sketch, the bridge has no nails. Only a pivot.",
	    "The spring runs beneath it. A brass eye hangs over the gap.");
      break;
    case 3:
      AdSay("Four disks in a drawer. Somebody peeled the labels off.",
	    "One machine can still read them. The bell has a hairline crack.");
      break;
  }
}

U0 AdSave()
{
  ad.stamp='ADIS1';
  if (!FileWrite("~/AfterDavis.SAV",&ad,sizeof(CADJourney)))
    AdSay("The disk did not take the bookmark. You can keep playing.");
}

Bool AdResume()
{
  I64 n;
  CADJourney *p=FileRead("~/AfterDavis.SAV",&n);
  if (!p)
    return FALSE;
  if (n!=sizeof(CADJourney) || p->stamp!='ADIS1' ||
	!(0<=p->room<4) || !(36<=p->x<=568) || !(255<=p->y<=311) ||
	!(0<=p->done<16) || !(0<=p->bag<16) || !(0<=p->secrets<16)) {
    Free(p);
    return FALSE;
  }
  MemCpy(&ad,p,n);Free(p);
  ad_knob=0;ad_mode=AD_WALK;
  AdSay("There's the crease where you left off.");
  return TRUE;
}

U0 AdSecret(I64 n,U8 *line,U8 *line2)
{
  if (!(ad.secrets & 1<<n)) {
    ad.secrets|=1<<n;
    AdSave;
  }
  AdSay(line,line2);
}

U0 AdLook()
{
  I64 spot=AdSpot;
  switch (ad.room*3+spot) {
    case 0:
      AdSay("BASIC on one side. Assembly on the other.",
	    "A little cassette still has its two write tabs.");
      break;
    case 1:
      if (ad.done&1)
	AdSecret(0,"Between the scan lines: 53280.","A border register. Why leave its address on a bird?");
      else
	AdSay("Three strips of the sprite are stored back to front.",
	      "The bird outside is a very patient model.");
      break;
    case 2:
      AdSay("A sparrow on the sill, looking right.","Its folded wing slopes down toward its tail.");
      break;
    case 3:
      AdSay("The counterfoil reads ROW 3, SEAT 1.","On the back: a pinwheel drawn in blue pencil.");
      break;
    case 4:
      AdSay("One shaft drives both drums. A small clutch drives only SEAT.",
	    "The proof must agree with the counterfoil before the gate opens.");
      break;
    case 5:
      if (ad.done&2)
	AdSecret(1,"Someone filed a tiny square wave into the brass.",
	      "It feels like the teeth on the tape counter.");
      else
	AdSay("The turnstile takes one clean proof.","The last one says row zero, seat zero.");
      break;
    case 6:
      AdSay("A plumb bob hangs from a surveyor's ribbon.",
	    "Its weight is three brass washers. Take it to the arm.");
      break;
    case 7:
      AdSay("Three washers turn the short arm. One turns the long.",
	    "Weight times distance. Both sides must pull equally.");
      break;
    case 8:
      if (ad.done&4)
	AdSecret(2,"A swallow's nest under the third stone.",
	      "Wedged in the mud: a label with just one letter. J.");
      else
	AdSay("Water threads through three arches.","Above the last is a carving of a bird.");
      break;
    case 9:
      AdSay("Inside the bell a single J is stamped under the oldest rivet.",
	    "Three more scratches run across it. Check the notebook.");
      break;
    case 10:
      AdSay("Their files have dates. Their labels have come unstuck.",
	    "Feed the press the oldest name first.");
      break;
    case 11:
      if (ad.done&8)
	AdSecret(3,"In the jamb, two tiny dollar signs around a star.",
	      "Someone left the document open for its next reader.");
      else
	AdSay("Cold blue light comes from the doorway.",
	      "There is still room on the shelf for a labeled release.");
      break;
  }
}

U0 AdTake()
{
  if (ad.bag & 1<<ad.room) {
    AdLook;
    return;
  }
  ad.bag|=1<<ad.room;AdSave;
  switch (ad.room) {
    case 0: AdSay("You turn the cassette over. The leader is still clear.");break;
    case 1: AdSay("You tear off the counterfoil. ROW 3. SEAT 1.");break;
    case 2: AdSay("You slip the brass weight off its ribbon.");break;
    case 3: AdSay("A blank label lifts from the underside of the bell.",
	  "A single J peeks through the patina. It went there first.");break;
  }
}

I64 ad_air_x,ad_air_y,ad_climb,ad_gate;
I64 ad_posts[4]={5,12,18,22},ad_gaps[4]={3,8,3,6};

U0 AdAirReset()
{
  ad_climb=0;
  if (ad_gate) {
    ad_air_x=ad_posts[ad_gate-1];
    ad_air_y=ad_gaps[ad_gate-1];
  } else {
    ad_air_x=0;ad_air_y=5;
  }
}

U0 AdAirKey(I64 ch,I64 sc)
{
  if (ch=='w' || ch=='W' || sc==SC_CURSOR_UP)
    ad_climb=MaxI64(-2,ad_climb-1);
  else if (ch=='s' || ch=='S' || sc==SC_CURSOR_DOWN)
    ad_climb=MinI64(2,ad_climb+1);
  else if (ch==CH_SPACE) {
    if (ad_climb<0) ad_climb++;else if (ad_climb>0) ad_climb--;
  } else
    return;
  ad_air_x++;ad_air_y+=ad_climb;
  if (!(0<=ad_air_y<=10) || ad_air_x==ad_posts[ad_gate] &&
        AbsI64(ad_air_y-ad_gaps[ad_gate])>1) {
    AdAirReset;
    AdSay("The tape rolls back to the last clean mark.",
          "Space levels the wings one step at a time.");
  } else if (ad_air_x==ad_posts[ad_gate]) {
    ad_gate++;
    Snd(48+ad_gate*3);Sleep(45);Snd;
    if (ad_gate==4) {
      ad_mode=AD_END;ad_page=0;
    } else
      AdSay("A clean take. The next splice is marked in yellow.");
  } else
    AdSay("The camera is rolling.");
}

U0 AdUse()
{
  I64 bit=1<<ad.room;
  switch (AdSpot) {
    case 0:
      AdTake;
      break;
    case 1:
      if (ad.done&bit)
	AdLook;
      else if (!(ad.bag&bit))
	AdSay("The bench needs a part. Walk left and inspect the room.");
      else {
	ad_mode=AD_BENCH;ad_knob=0;
	switch (ad.room) {
	  case 0: AdSay("Flip the three strips until the bird matches its shadow.");break;
	  case 1: AdSay("Print a proof to match the stub. ROW 3, SEAT 1.");break;
	  case 2: AdSay("Hang three washers on the left, one on the right.",
		"Balance the pulls with the left hook in its first notch.");break;
	  case 3: AdSay("Mark four disks, oldest first. Check the bell and notebook.");break;
	}
      }
      break;
    case 2:
      if (!(ad.done&bit))
	AdLook;
      else if (ad.room==3) {
	ad_gate=0;AdAirReset;ad_mode=AD_AIR;
	AdSay("The red lamp comes on. No one is counting down.");
      } else {
	MemSet(ad.dials,0,sizeof(ad.dials));
	ad.tape=0;AdEnter(ad.room+1);AdSave;
      }
      break;
  }
}

U0 AdSolved()
{
  Snd(52+ad.room*3);Sleep(55);Snd;
  ad.done|=1<<ad.room;ad_mode=AD_WALK;AdSave;
  switch (ad.room) {
    case 0: AdSay("The two wings meet. The bird fits in nine bytes.",
	  "Outside, the sill is empty. Head for the window.");break;
    case 1: AdSay("The blades cut a clean proof. The brass gate gives a click.",
	  "There is still time to look before you go through.");break;
    case 2: AdSay("The bob hangs still. Water runs in a level silver line.",
	  "The stone arch is within reach.");break;
    case 3: AdSay("Four labels dry beside the keyboard. The last reads V5.03.",
	  "Step through the open door when you are ready.");break;
  }
}

U0 AdTest()
{
  Bool ok=FALSE;
  switch (ad.room) {
    case 0: ok=ad.dials[0] && !ad.dials[1] && ad.dials[2];break;
    case 1: ok=ad.dials[0]==3 && ad.dials[1]==1;break;
    case 2: ok=!ad.dials[0] && ad.dials[1]==2;break;
    case 3:
      if ((ad_knob+2)%4==ad.tape) {
	if (++ad.tape==4)
	  ok=TRUE;
	else
	  AdSay("Ink takes. Select the next name.");
      } else {
	ad.tape=0;
	AdSay("The dates go backwards. Lift the strip and start again.");
      }
      break;
  }
  if (ok)
    AdSolved;
  else if (ad.room!=3)
    switch (ad.room) {
      case 0: AdSay("A wing still doubles back. Compare the lit and dim rows.");break;
      case 1: AdSay("The proof and stub disagree. The clutch can slip one drum.");break;
      case 2: AdSay("The left peg is marked I. Try changing the other arm.");break;
    }
}

I64 AdKnobs()
{
  switch (ad.room) {
    case 0: return 3;
    case 3: return 4;
  }
  return 2;
}

U0 AdTurn()
{
  switch (ad.room) {
    case 0: ad.dials[ad_knob]^=1;break;
    case 1:
      if (!ad_knob)
	ad.dials[0]=(ad.dials[0]+1)%4;
      ad.dials[1]=(ad.dials[1]+1)%4;
      break;
    case 2: ad.dials[ad_knob]=(ad.dials[ad_knob]+1)%3;break;
    case 3: AdTest;break;
  }
}

U0 AdBox(CDC *dc,I64 x,I64 y,I64 w,I64 h,I64 color)
{
  dc->color=color;GrRect(dc,x,y,w,h);
}

U0 AdText(CDC *dc,I64 x,I64 y,I64 color,U8 *st)
{
  dc->color=color;GrPrint(dc,x,y,"%s",st);
}

U0 AdAirDraw(CDC *dc,I64 x,I64 y)
{
  I64 i,j,px,py,gap,c;
  AdBox(dc,x+8,y+27,592,301,BLACK);
  AdText(dc,x+26,y+44,LTRED,"REC");
  AdText(dc,x+72,y+44,WHITE,"2017    /    ONE TAKE");
  AdText(dc,x+26,y+65,LTGRAY,"Your first sprite has one more flight. Frame it in each gate.");
  AdBox(dc,x+28,y+89,552,168,BLUE);
  for (i=0;i<80;i++) {
    px=x+32+(i*181)%540;py=y+94+(i*37)%149;
    c=DKGRAY;if (!(i%4)) c=LTCYAN;
    AdBox(dc,px,py,2,2,c);
  }
  for (i=0;i<4;i++) {
    px=x+45+ad_posts[i]*23;gap=y+105+ad_gaps[i]*13;
    c=YELLOW;if (i<ad_gate) c=LTGREEN;
    AdBox(dc,px,y+89,5,gap-16-y-89,c);
    AdBox(dc,px,gap+17,5,y+257-gap-17,c);
  }
  px=x+41+ad_air_x*23;py=y+101+ad_air_y*13;
  for (i=0;i<9;i++)
    for (j=0;j<8;j++)
      if (ad_bits[i] & 1<<j) AdBox(dc,px+j*2,py+i,2,1,WHITE);
  dc->color=LTCYAN;GrPrint(dc,x+26,y+274,"Print marks %d/4",ad_gate);
  AdText(dc,x+26,y+298,WHITE,"Up/W climb   Down/S dive   Space trim   One key, one beat");
  AdText(dc,x+10,y+350,WHITE,ad_line);
  AdText(dc,x+10,y+365,LTGRAY,ad_line2);
}

U0 AdBird(CDC *dc,I64 x,I64 y,Bool shadow)
{
  I64 r,c,k,row,color;
  for (r=0;r<9;r++) {
    row=ad_bits[r];
    for (c=0;c<8;c++) {
      k=c;
      if (!shadow && (!!ad.dials[r/3]!=(r/3!=1)))
	k=7-c;
      color=BLUE;
      if (row & 1<<k) {
	color=LTCYAN;
	if (shadow) color=LTGRAY;
      }
      AdBox(dc,x+c*5,y+r*4,4,3,color);
    }
  }
}

U0 AdBenchDraw(CDC *dc,I64 x,I64 y)
{
  I64 i,ax,bx,tilt;
  AdBox(dc,x+72,y+44,456,183,BLACK);
  AdBox(dc,x+72,y+44,456,2,YELLOW);
  AdText(dc,x+90,y+58,YELLOW,ad_stations[3*ad.room+1]);
  dc->color=WHITE;
  switch (ad.room) {
    case 0:
      AdBird(dc,x+166,y+98,TRUE);AdBird(dc,x+370,y+98,FALSE);
      AdText(dc,x+130,y+149,LTGRAY,"Window shadow");
      GrPrint(dc,x+319,y+149,"Tape strip %d / 3",ad_knob+1);
      AdBox(dc,x+362,y+98+ad_knob*12,3,11,YELLOW);
      break;
    case 1:
      GrPrint(dc,x+112,y+94,"STUB     ROW 3   SEAT 1");
      GrPrint(dc,x+112,y+120,"PROOF    ROW %d   SEAT %d",ad.dials[0],ad.dials[1]);
      if (ad_knob) AdText(dc,x+112,y+151,YELLOW,"Clutch: seat only");
      else AdText(dc,x+112,y+151,YELLOW,"Shaft: both drums");
      break;
    case 2:
      ax=ad.dials[0]+1;bx=ad.dials[1]+1;tilt=4*(3*ax-bx);
      dc->color=LTCYAN;GrLine(dc,x+195,y+106+tilt,x+405,y+106-tilt);
      AdBox(dc,x+296,y+107,8,26,LTGRAY);
      AdBox(dc,x+298-ax*30,y+108+tilt*ax/4,10,18,YELLOW);
      AdBox(dc,x+300+bx*30,y+108-tilt*bx/4,8,6,YELLOW);
      dc->color=WHITE;
      GrPrint(dc,x+100,y+150,"Left: 3 x %d      Right: 1 x %d",ax,bx);
      if (ad_knob) AdText(dc,x+350,y+166,YELLOW,"Right hook");
      else AdText(dc,x+350,y+166,YELLOW,"Left hook");
      break;
    case 3:
      for (i=0;i<4;i++) {
	AdBox(dc,x+95+i*101,y+91,88,44,DKGRAY+(CYAN-DKGRAY)*(i==ad_knob));
	AdText(dc,x+100+i*101,y+108,WHITE,ad_names[i]);
      }
      dc->color=WHITE;GrPrint(dc,x+100,y+152,"%d of 4 labels set",ad.tape);
      break;
  }
  AdText(dc,x+90,y+204,LTCYAN,"Left/Right select   Space adjust   Enter test   B back");
}

U0 AdDraw(CTask *task,CDC *dc)
{
  I64 x=(task->pix_width-608)/2,y=MaxI64(0,(task->pix_height-412)/2),i;
  AdBox(dc,0,0,task->pix_width,task->pix_height,BLACK);
  GrBlot(dc,x,y+24,ad_bg[ad.room]);
  if (ad_border) {
    AdBox(dc,x,y+24,608,3,ad_border);
    AdBox(dc,x,y+321,608,3,ad_border);
  }
  if (ad_mode==AD_TITLE) {
    AdBox(dc,x+30,y+168,350,128,BLACK);
    AdBox(dc,x+30,y+168,4,128,YELLOW);
    AdText(dc,x+48,y+188,YELLOW,"A F T E R   D A V I S");
    AdText(dc,x+48,y+219,WHITE,"An adventure in four working rooms");
    AdText(dc,x+48,y+247,LTCYAN,"Enter  Begin      R  Read bookmark");
    AdText(dc,x+48,y+270,LTGRAY,"Terry A. Davis, 1969-2018");
    AdText(dc,x+8,y+344,WHITE,ad_line);
    return;
  }
  if (ad_mode==AD_AIR) {AdAirDraw(dc,x,y);return;}
  if (ad_mode==AD_BOOK) {
    if (ad_print) {
      AdBox(dc,x+28,y+36,548,280,BLACK);
      GrBlot(dc,x+48,y+54,ad_photo);
      for (i=0;i<4;i++)
        if (!(ad.secrets & 1<<i))
          AdBox(dc,x+48+(i&1)*88,y+54+(i>>1)*116,88,116,DKGRAY);
      AdText(dc,x+249,y+65,YELLOW,"FROM THE PHOTO DRAWER");
      AdText(dc,x+249,y+96,WHITE,"Terry with a Commodore monitor.");
      AdText(dc,x+249,y+111,LTGRAY,"The photograph is undated.");
      AdText(dc,x+249,y+145,WHITE,"Each note you find uncovers");
      AdText(dc,x+249,y+159,WHITE,"a quarter of the print.");
      AdText(dc,x+249,y+239,LTCYAN,"P  Turn over     N  Put away");
      return;
    }
    AdBox(dc,x+18,y+75,572,166,BLACK);
    AdText(dc,x+35,y+90,YELLOW,"TERRY'S WORK   /   ARCHIVE NOTES");
    switch (ad.room) {
      case 0:
	AdText(dc,x+35,y+125,WHITE,"An Apple II at school. A Commodore 64 as a teenager.");
	AdText(dc,x+35,y+140,WHITE,"Terry learned assembly on the 64. Its border has an address.");
	break;
      case 1:
	AdText(dc,x+35,y+125,WHITE,"At ASU he studied computer systems and electrical engineering.");
	AdText(dc,x+35,y+140,WHITE,"Terry dates his Ticketmaster work to 1990-1996.");
	break;
      case 2:
	AdText(dc,x+35,y+125,WHITE,"At H.A.R.E., Terry wrote SimStructure. His TempleOS disc");
	AdText(dc,x+35,y+140,WHITE,"contains Span, where trusses can buckle under their load.");
	break;
      case 3:
	AdText(dc,x+35,y+125,WHITE,"Davis described TempleOS as an offering to God. Its charter");
	AdText(dc,x+35,y+140,WHITE,"specifies 640 x 480 and sixteen colors.");
        AdText(dc,x+35,y+163,LTCYAN,"Captured websites: LoseThos, May 2010. SparrowOS, Oct 2012.");
        AdText(dc,x+35,y+177,LTCYAN,"The Temple Operating System, Dec 2013.");
	break;
    }
    AdText(dc,x+35,y+204,LTCYAN,"P  Inspect photograph     N  Close notebook");
    return;
  }
  if (ad_mode==AD_END) {
    AdBox(dc,x+18,y+80,572,198,BLACK);
    AdText(dc,x+35,y+98,YELLOW,"AFTER DAVIS  /  FIELD NOTES");
    if (!ad_page) {
      AdText(dc,x+35,y+133,WHITE,"Terry learned assembly on a Commodore 64. At Ticketmaster");
      AdText(dc,x+35,y+147,WHITE,"he worked with software, hardware and mechanical systems.");
      AdText(dc,x+35,y+176,WHITE,"His operating system bore several names before TempleOS.");
      AdText(dc,x+35,y+190,WHITE,"You can still open its source and change a running machine.");
    } else {
      AdText(dc,x+35,y+133,WHITE,"On August 11, 2018, Terry died after being struck by");
      AdText(dc,x+35,y+147,WHITE,"a train in The Dalles, Oregon. He was 48.");
      AdText(dc,x+35,y+176,LTGRAY,"The rooms and their puzzles are imagined. The work survives.");
      for (i=0;i<4;i++)
	AdBox(dc,x+36+i*18,y+205,12,8,DKGRAY+(YELLOW-DKGRAY)*Bt(&ad.secrets,i));
      AdText(dc,x+118,y+205,LTCYAN,"Marginal notes");
      if (ad.secrets==15)
	AdText(dc,x+35,y+226,LTGRAY,"The old border still listens for its address.");
    }
    AdText(dc,x+35,y+251,YELLOW,"Enter  Turn page       Esc  Leave");
    return;
  }
  dc->color=LTCYAN;GrPrint(dc,x+6,y+7,"%s  /  %s",ad_years[ad.room],ad_titles[ad.room]);
  dc->color=LTGRAY;GrPrint(dc,x+418,y+7,"AFTER DAVIS   %d/4",ad.room+1);
  GrBlot(dc,x+ad.x-36,y+ad.y-76,ad_actor[ad_step&3]);
  if (ad_mode==AD_BENCH)
    AdBenchDraw(dc,x,y+24);
  dc->color=YELLOW;GrPrint(dc,x+6,y+334,"%s",ad_stations[3*ad.room+AdSpot]);
  if (ad.x==36 && ad.room)
    AdText(dc,x+155,y+334,LTGRAY,"Left: previous room");
  if (ad.bag & 1<<ad.room) {
    dc->color=LTCYAN;GrPrint(dc,x+395,y+334,"Pocket: %s",ad_items[ad.room]);
  }
  AdText(dc,x+6,y+353,WHITE,ad_line);
  AdText(dc,x+6,y+366,WHITE,ad_line2);
  AdText(dc,x+6,y+394,LTGRAY,"Arrows walk   L look   Space use   N notebook   F5 save   Esc quit");
}

Bool AdKey(I64 ch,I64 sc)
{
  I64 dx=0,dy=0;
  if (ch==CH_ESC || ch==CH_SHIFT_ESC) return FALSE;
  if (ad_mode==AD_AIR) {AdAirKey(ch,sc);return TRUE;}
  if (ch>='0' && ch<='9') {
    ad_code=(ad_code*10+ch-'0')%100000;
    if (ad_code==53280) {
      ad_border=(ad_border%15)+1;
      AdSay("A band of color runs around the glass.");
    }
  }
  if (ad_mode==AD_BOOK) {
    if (ch=='p' || ch=='P') ad_print=!ad_print;
    if (ch=='n' || ch=='N' || ch=='b' || ch=='B') ad_mode=ad_from;
    return TRUE;
  }
  if (ad_mode==AD_WALK && (ch=='n' || ch=='N')) {
    ad_print=FALSE;ad_from=ad_mode;ad_mode=AD_BOOK;return TRUE;
  }
  if (ad_mode==AD_TITLE) {
    if (ch=='r' || ch=='R') {
      if (!AdResume)
	AdSay("No readable bookmark. Press Enter to begin.");
    } else if (ch==CH_SPACE || ch=='\n') {
      MemSet(&ad,0,sizeof(CADJourney));AdEnter(0);
    }
  } else if (ad_mode==AD_END) {
    if (ch=='\n' || ch==CH_SPACE) {
      if (ad_page++) {
	ad_page=0;ad_mode=AD_TITLE;ad.room=0;AdSay("");
      }
    }
  } else if (ad_mode==AD_BENCH) {
    if (ch=='b' || ch=='B') ad_mode=AD_WALK;
    else if (sc==SC_CURSOR_LEFT || ch=='a') ad_knob=(ad_knob+AdKnobs-1)%AdKnobs;
    else if (sc==SC_CURSOR_RIGHT || ch=='d') ad_knob=(ad_knob+1)%AdKnobs;
    else if (ch==CH_SPACE) AdTurn;
    else if (ch=='\n') AdTest;
  } else {
    if (sc==SC_CURSOR_LEFT || ch=='a' || ch=='A') dx=-18;
    if (sc==SC_CURSOR_RIGHT || ch=='d' || ch=='D') dx=18;
    if (sc==SC_CURSOR_UP || ch=='w' || ch=='W') dy=-8;
    if (sc==SC_CURSOR_DOWN || ch=='s' || ch=='S') dy=8;
    if (dx<0 && ad.x==36 && ad.room) {
      AdEnter(ad.room-1);ad.x=568;
      AdSay("You turn back to an earlier page.");AdSave;
    } else if (dx || dy) {
      ad.x=ClampI64(ad.x+dx,36,568);
      ad.y=ClampI64(ad.y+dy,255,311);
      ad_step++;
    } else if (ch=='l' || ch=='L') AdLook;
    else if (ch==CH_SPACE || ch=='\n') AdUse;
    else if (sc==SC_F5) {
      AdSay("Bookmark tucked into the margin.");AdSave;
    }
  }
  return TRUE;
}

U0 AfterDavis()
{
  I64 i,sc,ch;
  U8 name[STR_LEN];
  SettingsPush;
  try {
    Cd(__DIR__);
    ad_photo=GRRead("Art/Print.GR");
    if (!ad_photo) throw('Artwork');
    for (i=0;i<4;i++) {
      StrPrint(name,"Art/%s.GR",ad_rooms[i]);ad_bg[i]=GRRead(name);
      StrPrint(name,"Art/Terry%d.GR",i);ad_actor[i]=GRRead(name);
      if (!ad_bg[i] || !ad_actor[i]) throw('Artwork');
    }
    AutoComplete;WinBorder;WinMax;DocCursor;DocClear;FlushMsgs;
    ad_mode=AD_TITLE;ad.room=0;ad_step=0;ad_code=0;ad_border=0;AdSay("");
    Fs->draw_it=&AdDraw;
    do {
      ch=GetKey(&sc);
    } while (AdKey(ch,sc.u8[0]));
  } catch
    PutExcept;
  SettingsPop;
  DCDel(ad_photo);ad_photo=NULL;
  for (i=0;i<4;i++) {
    DCDel(ad_bg[i]);ad_bg[i]=NULL;
    DCDel(ad_actor[i]);ad_actor[i]=NULL;
  }
}

AfterDavis;

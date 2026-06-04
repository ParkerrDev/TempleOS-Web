//============================================================================
// snapregs.HC — CPU state extracted from qemu-wasm's LIVE migration stream (snapshot.bin,
// cpu section) by tools/parse-migration.mjs.  rip is mid-GrScrn (the WinMgr was rendering),
// FS base = sys_winmgr_task (0x11125628) — the live, running WinMgr.  Pairs with live.bin RAM.
//============================================================================
U0 SetSnapRegs()
{
  reg[0]=0x4b000;  reg[1]=0x280;  reg[2]=0x0;  reg[3]=0xbf77a3dda6750001;
  reg[4]=0x1111d040;  reg[5]=0x1111d0a0;  reg[6]=0x119255a6;  reg[7]=0x119acff8;
  reg[8]=0xbfb999999999999a;  reg[9]=0x3fc973f4529f135b;  reg[10]=0x4b000;  reg[11]=0x11824da7;
  reg[12]=0xff;  reg[13]=0x657e;  reg[14]=0x119ad3d8;  reg[15]=0x0;
  rip=0x119c8480; rfl=0x246;
  cr0=0x80000031; cr3=0x509000; cr4=0xb0; msr_efer=0x500;
  msr_fsbase=0x11125628; msr_gsbase=0x15f8c028;     // FS = the live WinMgr task
  gdtr_base=0x8020; gdtr_limit=0x107f; idtr_base=0x15e82c28; idtr_limit=0xfff;
  g_cs=0x40; g_ss=0x60; halted=0; icount=0; g_badop=0;
  pic1_base=0x20; pic2_base=0x28;
  pic1_mask=0xF8; pic2_mask=0xEF; pic1_irr=0; pic2_irr=0; pic1_isr=0; pic2_isr=0;
  pit_div=20000; pit_counter=20000; irq_count=0; hpet_ctr=0;
  // tS = (GetTSC - boot_tsc)/freq; boot_tsc ~= 206.1e9 in the snapshot, so set GetTSC ~= boot_tsc
  // + 150*freq to make tS ~= 150 >= winmgr.ideal_refresh_tS (149.26) -> WinMgr self-sustains.
  tsc=360000000000;
  rtc_idx=0; rtc_base_sec=5819; rtc_dow=3; rtc_day=3; rtc_mon=6; rtc_year=24;
}

//============================================================================
// anim.HC — hemu animated entry. The host calls __main once per display frame;
// hemu runs a real x86-64 frame() function (clang) with an incrementing time
// arg, then presents. Same machinery the TempleOS snapshot will use: host-paced
// run + present, state persisting in the wasm instance across calls.
//============================================================================
#include "cpu.HC"

#define FB 0x200000

// clang -O1 x86-64: void frame(U8 *fb, U64 t){for(y<480)for(x<640) fb[y*640+x]=(((x+t)>>4)^(y>>4))&15;}
// fb in RDI, t in RSI; scalar (LEA+SIB, SHR, multi-byte NOP), returns when done.
U8 kernel[74] = {
  0x31,0xC0, 0x66,0x66,0x66,0x66,0x66,0x2E,0x0F,0x1F,0x84,0x00,0x00,0x00,0x00,0x00,
  0x31,0xC9, 0x66,0x66,0x66,0x66,0x66,0x2E,0x0F,0x1F,0x84,0x00,0x00,0x00,0x00,0x00,
  0x8D,0x14,0x0E, 0x31,0xC2, 0xC0,0xEA,0x04, 0x88,0x14,0x0F,
  0x48,0xFF,0xC1, 0x48,0x81,0xF9,0x80,0x02,0x00,0x00, 0x75,0xE9,
  0x48,0xFF,0xC0, 0x48,0x81,0xC7,0x80,0x02,0x00,0x00, 0x48,0x3D,0xE0,0x01,0x00,0x00, 0x75,0xC7,
  0xC3};

I64 g_inited, g_t;

U0 Main()
{
  I64 i;
  if (!g_inited) {
    InitMem(4194304);
    Reset();
    for (i = 0; i < 74; i++) mem[0x1000 + i] = kernel[i];
    g_inited = 1; g_t = 0;
  }
  reg[7] = FB;                                   // RDI = framebuffer
  reg[6] = g_t;                                  // RSI = time (animates the pattern)
  mem[0x4000] = 0xF4;                            // return sentinel HLT
  reg[4] = 0x180000; reg[4] -= 8; WrMem(reg[4], 8, 0x4000);
  rip = 0x1000; halted = 0;
  Run(icount + 20000000);                        // run frame() to completion
  __present(mem + FB, 640, 480);
  g_t += 8;
}
Main;

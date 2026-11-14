//Hello + FizzBuzz - a console smoke test for the HolyC->WASM compiler.
"Hello from HolyC, compiled to WebAssembly!\n\n";

U0 FizzBuzz(I64 n)
{
  I64 i;
  for (i=1;i<=n;i++) {
    if (!(i%15))     "FizzBuzz\n";
    else if (!(i%3)) "Fizz\n";
    else if (!(i%5)) "Buzz\n";
    else	     "%d\n",i;
  }
}
FizzBuzz(20);

"\nPrimes up to 50: ";
U0 Primes(I64 n)
{
  I64 i,j,is;
  for (i=2;i<=n;i++) {
    is=1;
    for (j=2;j*j<=i;j++)
      if (!(i%j)) { is=0; break; }
    if (is) "%d ",i;
  }
  '\n';
}
Primes(50);

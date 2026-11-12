U0 ToomBuild()
{//Compile a relocatable module before replacing the previous build.
  I64 size;
  CBinFile *bfh=NULL;
  Cd(__DIR__);
  Del("ToomNew.BIN");
  try {
    if (Cmp("Toom.PRJ",,"ToomNew.BIN")) throw('Compile');
    bfh=FileRead("ToomNew.BIN",&size);
    if (!bfh || size<sizeof(CBinFile) || bfh->file_size!=size ||
	  bfh->bin_signature!=BIN_SIGNATURE_VAL || bfh->org!=INVALID_PTR ||
	  !(sizeof(CBinFile)<=bfh->patch_table_offset<size))
      throw('Module');
    if (!Move("ToomNew.BIN","Toom.BIN")) throw('Write');
  } catch {
    Free(bfh); Del("ToomNew.BIN");
  }
  Free(bfh); Del("ToomNew.BIN");
}

ToomBuild;

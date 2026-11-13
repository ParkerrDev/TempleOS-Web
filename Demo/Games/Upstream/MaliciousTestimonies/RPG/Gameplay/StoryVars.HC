#define TABLE_SIZE 1024

CHashTable *storyHashs=HashTableNew(TABLE_SIZE);


U0 AddStoryHash(U8 *key, U8* value)
{
  CHashDefineStr *i = MAlloc(sizeof(CHashDefineStr));
  i->type = HTT_DEFINE_STR;
  i->str = StrNew(key);
  i->data = StrNew(value);
  HashAdd(i,storyHashs);

}

U8 *GetStoryHash(U8 *key)
{
  CHashDefineStr *pulled;
  I64 i; U8 *value ="";
  
  pulled = HashFind(StrNew(key),storyHashs,HTT_DEFINE_STR);
  value = pulled->data;

  return value;
} 

#include "../../../engine/native/Streams.hpp"
#include <QCryptographicHash>
#include <iostream>
int main(int argc,char **argv) {
  if(argc<3)return 2;
  try {
    InflateFile input(QString::fromLocal8Bit(argv[2]));
    std::array<unsigned char,131072> bytes;
    if(std::string(argv[1])=="read") {
      QCryptographicHash hash(QCryptographicHash::Sha256);size_t total=0,n;
      while((n=input.Read(bytes.data(),bytes.size()))){total+=n;hash.addData(QByteArrayView(reinterpret_cast<char *>(bytes.data()),n));}
      std::cout<<total<<" "<<hash.result().toHex().constData()<<"\n";
    } else {
      if(argc!=4)return 2;
      DeflateFile output(QString::fromLocal8Bit(argv[3]));size_t n;
      while((n=input.Read(bytes.data(),bytes.size())))output.Write(bytes.data(),n);
      if(std::string(argv[1])=="cancel")throw std::runtime_error("Injected cancellation");
      output.Commit();
    }
    return 0;
  } catch(const std::exception &error){std::cerr<<error.what()<<"\n";return 1;}
}

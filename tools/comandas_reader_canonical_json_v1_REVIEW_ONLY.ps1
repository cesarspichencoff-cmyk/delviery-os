# TATÁ Reader — deterministic JSON.stringify-compatible subset.
# REVIEW ONLY. Pure .NET serialization for a fixed, ordered native event shape.
# Does not access SQL/files/services/network/prints. Use on Foxxy fixtures only.
# Strictly supports: OrderedDictionary, object[]/IList, string, bool, integer, null.
# Rejects unpaired UTF-16 surrogates and non-ordered dictionaries.
# Dot-source in an approved isolated process; never in the running Reader.
$ErrorActionPreference = "Stop"
if (-not ("TataCanonicalJsonReviewV1" -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections;
using System.Collections.Specialized;
using System.Globalization;
public static class TataCanonicalJsonReviewV1 {
  private static void Esc(StringBuilder b, string s) {
    b.Append('"');
    for(int i=0;i<s.Length;i++) {
      char c=s[i];
      if(c=='"') b.Append("\\\"");
      else if(c=='\\') b.Append("\\\\");
      else if(c=='\b') b.Append("\\b");
      else if(c=='\f') b.Append("\\f");
      else if(c=='\n') b.Append("\\n");
      else if(c=='\r') b.Append("\\r");
      else if(c=='\t') b.Append("\\t");
      else if(c<0x20) {
        b.Append("\\u").Append(((int)c).ToString("x4",CultureInfo.InvariantCulture));
      } else if(char.IsHighSurrogate(c)) {
        if(i+1>=s.Length||!char.IsLowSurrogate(s[i+1]))
          throw new ArgumentException("UNPAIRED_HIGH_SURROGATE");
        b.Append(c).Append(s[++i]);
      } else if(char.IsLowSurrogate(c)) {
        throw new ArgumentException("UNPAIRED_LOW_SURROGATE");
      } else b.Append(c);
    }
    b.Append('"');
  }
  private static void Value(StringBuilder b, object v, int depth) {
    if(depth>24)throw new ArgumentException("CANONICAL_JSON_DEPTH_EXCEEDED");
    if(v==null){b.Append("null");return;}
    if(v is string){Esc(b,(string)v);return;}
    if(v is bool){b.Append((bool)v?"true":"false");return;}
    if(v is int||v is long||v is short||v is byte||v is uint||v is ulong){
      // JavaScript numbers are exact only within +/- (2^53 - 1).
      const long max=9007199254740991L;
      if(v is ulong) {
        if((ulong)v>(ulong)max)throw new ArgumentException("UNSAFE_JAVASCRIPT_INTEGER");
      } else {
        long n=Convert.ToInt64(v,CultureInfo.InvariantCulture);
        if(n>max||n< -max)throw new ArgumentException("UNSAFE_JAVASCRIPT_INTEGER");
      }
      b.Append(Convert.ToString(v,CultureInfo.InvariantCulture));return;
    }
    OrderedDictionary d=v as OrderedDictionary;
    if(d!=null){
      b.Append('{');bool first=true;
      foreach(DictionaryEntry e in d){
        string key=e.Key as string;
        if(key==null)throw new ArgumentException("PROPERTY_KEY_NOT_STRING");
        if(!first)b.Append(',');first=false;
        Esc(b,key);b.Append(':');Value(b,e.Value,depth+1);
      }
      b.Append('}');return;
    }
    if(v is IDictionary)throw new ArgumentException("UNORDERED_OBJECT_FORBIDDEN");
    IList list=v as IList;
    if(list!=null){
      b.Append('[');
      for(int i=0;i<list.Count;i++){
        if(i>0)b.Append(',');
        Value(b,list[i],depth+1);
      }
      b.Append(']');return;
    }
    throw new ArgumentException("UNSUPPORTED_CANONICAL_JSON_TYPE_"+v.GetType().FullName);
  }
  public static string Encode(object value){
    StringBuilder b=new StringBuilder();
    Value(b,value,0);return b.ToString();
  }
}
'@ -Language CSharp -ErrorAction Stop
}
function ConvertTo-TataCanonicalJsonV1 {
  [CmdletBinding()]
  param([Parameter(Mandatory=$true)][AllowNull()]$Value)
  [TataCanonicalJsonReviewV1]::Encode($Value)
}
function Get-TataCanonicalSha256V1 {
  [CmdletBinding()]
  param([Parameter(Mandatory=$true)][AllowNull()]$Value)
  $json = [TataCanonicalJsonReviewV1]::Encode($Value)
  [byte[]]$bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $hash = [Security.Cryptography.SHA256]::Create()
  try {([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace("-","").ToLowerInvariant()}
  finally{$hash.Dispose()}
}

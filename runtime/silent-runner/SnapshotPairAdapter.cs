// Offline fixture-only snapshot pair validation for the existing Windows no-console runner.
// No browser, Reader service, network, credentials, order IDs or direct operational paths.
using System;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace DeliveryOS.SilentLab {
  internal sealed class PairEvidence {
    internal string State = "HOLD_NO_PAIR";
    internal int SyntheticMatches = 0;
    internal int ReaderFixtureRecords = 0;
    internal int GestorFixtureRecords = 0;
    internal bool ReaderFresh = false;
    internal bool GestorFresh = false;
  }

  internal static class SnapshotPairAdapter {
    private const string ReaderFile = "reader-sanitized.fixture.json";
    private const string GestorFile = "gestor-sanitized.fixture.json";
    private static readonly Encoding Utf8 = new UTF8Encoding(false, true);
    private static readonly Regex FixtureKey = new Regex(@"^LAB-[0-9]{4}$",RegexOptions.CultureInvariant);
    private static readonly Regex UtcStamp = new Regex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$",RegexOptions.CultureInvariant);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=4096, RecursionLimit=8 };

    internal static PairEvidence Evaluate(string directory, DateTime now) {
      var result = new PairEvidence();
      if (String.IsNullOrEmpty(directory)) return result;
      string rp=Path.Combine(directory,ReaderFile),gp=Path.Combine(directory,GestorFile);
      if (!File.Exists(rp)||!File.Exists(gp)) return result;
      try {
        IDictionary<string,object> reader=ReadEnvelope(rp);
        IDictionary<string,object> gestor=ReadEnvelope(gp);
        if(reader==null||gestor==null){result.State="HOLD_INVALID_PAIR";return result;}
        if (!HasKeys(reader,"schema","sourceMode","host","unitId","observedAtUtc","fixtureOnly","liveSourceVerified","noActionExecuted","customerDataExported","records") ||
            !HasKeys(gestor,"schema","mode","route","observedAt","classification","fixtureOnly","verifiedMerchant","verifiedCoverage","identifiersCaptured","personalDataCaptured","records") ||
            !Exact(reader,"schema","deliveryos.itaim.automatic-reader-status.v1") ||
            !Exact(reader,"sourceMode","CONTROL_DIAGNOSTIC_NOT_REAL_PROOF") ||
            !Exact(reader,"host","CAIXA_MOOCA")||!Exact(reader,"unitId","ITAIM") ||
            !Bool(reader,"fixtureOnly",true)||!Bool(reader,"liveSourceVerified",false) ||
            !Bool(reader,"noActionExecuted",true)||!Bool(reader,"customerDataExported",false) ||
            !Exact(gestor,"schema","tata.gestor.structure-v2") ||
            !Exact(gestor,"mode","SHADOW_READ_ONLY")||!Exact(gestor,"route","expedition") ||
            !Exact(gestor,"classification","STRUCTURE_ONLY_UNVERIFIED") ||
            !Bool(gestor,"fixtureOnly",true)||!Bool(gestor,"verifiedMerchant",false) ||
            !Bool(gestor,"verifiedCoverage",false)||!Bool(gestor,"identifiersCaptured",false) ||
            !Bool(gestor,"personalDataCaptured",false)){
          result.State="HOLD_INVALID_PAIR";return result;
        }
        DateTime rt,gt;
        if (!Time(reader,"observedAtUtc",out rt)||!Time(gestor,"observedAt",out gt)) {
          result.State="HOLD_INVALID_CLOCK";return result;
        }
        double rAge=(now-rt).TotalSeconds,gAge=(now-gt).TotalSeconds;
        result.ReaderFresh = rAge>=-5 && rAge<=120;
        result.GestorFresh = gAge>=-5 && gAge<=120;
        if(!result.ReaderFresh||!result.GestorFresh){result.State="HOLD_STALE_OR_FUTURE";return result;}
        Dictionary<string,Record> rr,gg;
        if (!Records(reader,"records",out rr,out result.ReaderFixtureRecords) ||
            !Records(gestor,"records",out gg,out result.GestorFixtureRecords)){
          result.State="HOLD_INVALID_RECORDS";return result;
        }
        if(rr.Count==0||gg.Count==0){result.State="HOLD_EMPTY";return result;}
        if(rr.Count!=gg.Count){result.State="HOLD_UNPAIRED";return result;}
        foreach(var pair in rr) {
          Record other;
          if(!gg.TryGetValue(pair.Key,out other)){result.State="HOLD_UNPAIRED";return result;}
          if(pair.Value.Revision!=other.Revision || pair.Value.Items!=other.Items ||
             pair.Value.Options!=other.Options) {
            result.State="HOLD_DIVERGENT_REVISIONS_OR_LINES";return result;
          }
        }
        // An intentionally artificial match of fixture labels, not a real order identity.
        result.SyntheticMatches=rr.Count;
        result.State="SYNTHETIC_PAIR_ONLY";
        return result;
      } catch (Exception) {
        result.State="HOLD_INVALID_PAIR";
        result.SyntheticMatches=0;
        return result;
      }
    }

    private sealed class Record {
      internal int Revision,Items,Options;
    }

    private static IDictionary<string,object> ReadEnvelope(string file) {
      var info = new FileInfo(file);
      if(info.Length==0||info.Length>4096||(info.Attributes&FileAttributes.ReparsePoint)!=0)return null;
      string text=File.ReadAllText(file,Utf8);
      if(text.IndexOf('\0')>=0)return null;
      return Json.DeserializeObject(text) as IDictionary<string,object>;
    }
    private static bool HasKeys(IDictionary<string,object> o,params string[] keys) {
      if(o==null||o.Count!=keys.Length)return false;
      foreach(string key in keys)if(!o.ContainsKey(key))return false;
      return true;
    }
    private static bool Exact(IDictionary<string,object> o,string key,string value){
      object v;return o.TryGetValue(key,out v)&&v is string&&String.Equals((string)v,value,StringComparison.Ordinal);
    }
    private static bool Bool(IDictionary<string,object> o,string key,bool value){
      object v;return o.TryGetValue(key,out v)&&v is bool&&(bool)v==value;
    }
    private static bool Time(IDictionary<string,object> o,string key,out DateTime utc){
      utc=DateTime.MinValue;
      object v;if(!o.TryGetValue(key,out v)||!(v is string)||!UtcStamp.IsMatch((string)v))return false;
      DateTime parsed;
      if(!DateTime.TryParseExact((string)v,new string[]{"yyyy-MM-ddTHH:mm:ss'Z'",
         "yyyy-MM-ddTHH:mm:ss.FFFFFFF'Z'"},CultureInfo.InvariantCulture,
          DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out parsed))return false;
      if(parsed.Year<2020||parsed.Year>2100)return false;
      utc=parsed;return true;
    }
    private static bool Count(IDictionary<string,object> o,string key,int low,int high,out int value){
      value=0;object item;
      if(!o.TryGetValue(key,out item))return false;
      if(item is int)value=(int)item;
      else if(item is long&&((long)item)>=low&&((long)item)<=high)value=(int)(long)item;
      else return false;
      return value>=low&&value<=high;
    }
    private static bool Records(IDictionary<string,object> o,string key,out Dictionary<string,Record> rows,out int number){
      rows=new Dictionary<string,Record>(StringComparer.Ordinal);
      number=0;
      object value;
      if(!o.TryGetValue(key,out value))return false;
      IList array=value as IList;
      if(array==null||array.Count>16)return false;
      number=array.Count;
      foreach(object item in array) {
        var data=item as IDictionary<string,object>;
        if(!HasKeys(data,"fixtureKey","revision","itemLines","optionLines"))return false;
        object keyValue;
        if(!data.TryGetValue("fixtureKey",out keyValue)||!(keyValue is string))return false;
        string id=(string)keyValue;
        if(!FixtureKey.IsMatch(id)||rows.ContainsKey(id))return false;
        int rev,items,options;
        if(!Count(data,"revision",1,50,out rev) ||
           !Count(data,"itemLines",1,250,out items)||
           !Count(data,"optionLines",0,1000,out options))return false;
        rows.Add(id,new Record{Revision=rev,Items=items,Options=options});
      }
      return true;
    }
  }
}

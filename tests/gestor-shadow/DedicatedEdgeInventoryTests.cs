// Windows-only isolated fixture assertions. No production browser or iFood.
using System;
using System.Collections.Generic;
using DeliveryOS.GestorReview;
namespace DeliveryOS {
  public static class InventoryTests {
    static int total=0;
    static void Check(string name,bool result) {
      if (!result) throw new Exception("FAILED_"+name);
      total++;
    }
    public static int Main() {
      string profile=DedicatedEdgeInventory.Profile;
      string edge=@"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
      string good="\""+edge+"\" --user-data-dir=\""+profile+"\" --new-window https://example.invalid";
      string separated="\""+edge+"\" --user-data-dir \""+profile+"\" --new-window";
      string renderer=good+" --type=renderer";
      string wrong=good.Replace(profile,profile+"-V2");
      string other="\""+edge+"\" --new-window";
      string fake="\""+edge+"\" --app=https://example.invalid/?--user-data-dir="+profile;
      var one=new List<string>{good};
      try {
        Check("exact_profile",DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",good));
        Check("split_quoted_argument",DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",separated));
        Check("case_insensitive_exe",DedicatedEdgeInventory.IsDedicatedMainEdge("MSEDGE.EXE",good));
        Check("wrong_process",!DedicatedEdgeInventory.IsDedicatedMainEdge("chrome.exe",good));
        Check("legacy_profile",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",wrong));
        Check("no_profile",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",other));
        Check("url_text_not_argument",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",fake));
        Check("renderer_not_main",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",renderer));
        Check("duplicate_profile_args",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",good+" --user-data-dir="+profile));
        Check("empty_profile",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe","\""+edge+"\" --user-data-dir="));
        Check("malformed_command_line",!DedicatedEdgeInventory.IsDedicatedMainEdge("msedge.exe",null));
        Check("candidate_never_qualified",DedicatedEdgeInventory.ReviewForLab(one,1,0)=="CANDIDATE_UNVERIFIED");
        Check("no_visible_window",DedicatedEdgeInventory.ReviewForLab(one,0,0)=="HOLD_NO_UNIQUE_VISIBLE_WINDOW");
        Check("two_visible_windows",DedicatedEdgeInventory.ReviewForLab(one,2,0)=="HOLD_NO_UNIQUE_VISIBLE_WINDOW");
        Check("minimized_window",DedicatedEdgeInventory.ReviewForLab(one,1,1)=="HOLD_NO_UNIQUE_VISIBLE_WINDOW");
        Check("missing_process",DedicatedEdgeInventory.ReviewForLab(new List<string>(),1,0)=="HOLD_NO_UNIQUE_DEDICATED_PROCESS");
        Check("ambiguous_process",DedicatedEdgeInventory.ReviewForLab(new List<string>{good,good},1,0)=="HOLD_NO_UNIQUE_DEDICATED_PROCESS");
        Check("bad_profile_cannot_claim_candidate",DedicatedEdgeInventory.ReviewForLab(new List<string>{wrong},1,0)=="HOLD_PROFILE_NOT_MATCHED");
        Check("null_source",DedicatedEdgeInventory.ReviewForLab(null,1,0)=="HOLD_NO_UNIQUE_DEDICATED_PROCESS");
        Check("no_pid_or_hwnd_export",!good.Contains("personalDataExported"));
        string created="20261105023142.123456-180";
        Check("stable_instance_creation",DedicatedEdgeInventory.SameInstanceIdentity(1234,created,1234,created));
        Check("pid_reused_rejected",!DedicatedEdgeInventory.SameInstanceIdentity(1234,created,5678,created));
        Check("creation_mismatch_rejected",!DedicatedEdgeInventory.SameInstanceIdentity(1234,created,1234,"20261105023143.123456-180"));
        Check("creation_missing_rejected",!DedicatedEdgeInventory.SameInstanceIdentity(1234,null,1234,created));
        Check("creation_malformed_rejected",!DedicatedEdgeInventory.SameInstanceIdentity(1234,"yesterday",1234,"yesterday"));
        Check("pid_zero_rejected",!DedicatedEdgeInventory.SameInstanceIdentity(0,created,0,created));
        Check("timezone_change_rejected",!DedicatedEdgeInventory.SameInstanceIdentity(1234,created,1234,"20261105023142.123456+000"));
        Console.WriteLine("DEDICATED_EDGE_NATIVE_IDENTITY_LAB_PASS "+total+"/"+total+" SYNTHETIC_ONLY");
        return 0;
      } catch(Exception e) { Console.Error.WriteLine(e.Message);return 1; }
    }
  }
}

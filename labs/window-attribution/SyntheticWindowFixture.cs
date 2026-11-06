// Synthetic HWND creator on disposable Windows GitHub runner ONLY.
// A deliberately tiny offscreen non-activating window; no content, no I/O,
// no network, no console, and no effect on any workstation.
using System;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;
using System.IO;
namespace DeliveryOS.WindowAttributionLab {
  public sealed class SyntheticForm : Form {
    protected override bool ShowWithoutActivation {get{return true;}}
    public SyntheticForm() {
      Text="";
      ShowInTaskbar=false;
      FormBorderStyle=FormBorderStyle.None;
      StartPosition=FormStartPosition.Manual;
      Location=new Point(-4000,-4000);
      Size=new Size(8,8);
    }
  }
  public static class WindowAttributionFixture {
    [STAThread] public static int Main(string[] args) {
      if(String.Equals(Environment.MachineName,"CAIXA_MOOCA",StringComparison.OrdinalIgnoreCase) ||
         Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true" ||
         Environment.GetEnvironmentVariable("GITHUB_REPOSITORY")!="cesarspichencoff-cmyk/delviery-os")
        return 77;
      if(args==null || args.Length!=2 || args[0]!="--mode=visible" && args[0]!="--mode=hidden" ||
         !args[1].StartsWith("--lab-dir=",StringComparison.Ordinal)) return 78;
      string folder=args[1].Substring("--lab-dir=".Length);
      if(!Path.IsPathRooted(folder) ||
         !String.Equals(Path.GetFileName(Path.GetFullPath(folder).TrimEnd('\\','/')),
                       "deliveryos-window-attribution-lab",StringComparison.OrdinalIgnoreCase))
        return 79;
      string marker=Path.Combine(folder,"LAB_ONLY.txt");
      if(!File.Exists(marker) || File.ReadAllText(marker).Trim()!="DELIVERYOS_WINDOW_ATTRIBUTION_DISPOSABLE_LAB_V1")
        return 79;
      using(var form=new SyntheticForm()) {
        form.CreateControl();
        if(args[0]=="--mode=visible")form.Show();
        else form.Hide();
        DateTime until=DateTime.UtcNow.AddSeconds(6);
        while(DateTime.UtcNow<until) {
          Application.DoEvents();
          Thread.Sleep(25);
        }
      }
      return 0;
    }
  }
}

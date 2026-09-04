import ExpoModulesCore

public class GradeLensOmrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GradeLensOmr")

    AsyncFunction("setValueAsync") { (value: String) in
    }
  }
}

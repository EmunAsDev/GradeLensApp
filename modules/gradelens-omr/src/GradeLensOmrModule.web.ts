import { registerWebModule, NativeModule } from 'expo';

class GradeLensOmrModule extends NativeModule<{}> {
  async setValueAsync(value: string): Promise<void> {}
}

export default registerWebModule(GradeLensOmrModule, 'GradeLensOmrModule');

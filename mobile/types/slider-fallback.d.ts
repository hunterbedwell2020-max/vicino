declare module "@react-native-community/slider" {
  import * as React from "react";
  import { ViewProps } from "react-native";

  export interface SliderProps extends ViewProps {
    value?: number;
    minimumValue?: number;
    maximumValue?: number;
    step?: number;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
    thumbTintColor?: string;
    onValueChange?: (value: number) => void;
  }

  const Slider: React.ComponentType<SliderProps>;
  export default Slider;
}

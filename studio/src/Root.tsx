import { Composition, Still } from "remotion";
import { GlCheck } from "./GlCheck";
import { Hello } from "./Hello";
import { PlateCheck, plateCheckDefaults } from "./PlateCheck";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Hello"
        component={Hello}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still id="GlCheck" component={GlCheck} width={1280} height={720} />
      <Still
        id="PlateCheck"
        component={PlateCheck}
        width={1920}
        height={1080}
        defaultProps={plateCheckDefaults}
      />
    </>
  );
};

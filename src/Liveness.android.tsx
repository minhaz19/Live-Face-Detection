/* eslint-disable react-native/no-inline-styles */
import React, { useReducer } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  useEffect,
  useState,
  useRef,
} from 'react';
import {
  Frame,
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  Face,
  Camera,
  FaceDetectionOptions,
} from 'react-native-vision-camera-face-detector';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAppState } from '@react-native-community/hooks';
import Svg, { Path, SvgProps } from 'react-native-svg';
import { AnimatedCircularProgress } from 'react-native-circular-progress';

const { width: windowWidth } = Dimensions.get('window');

interface FaceDetection {
  rollAngle: number
  yawAngle: number
  smilingProbability: number
  leftEyeOpenProbability: number
  rightEyeOpenProbability: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}


const detections = {
  BLINK: { promptText: 'Blink both eyes', minProbability: 0.4 },
  TURN_HEAD_LEFT: { promptText: 'Turn head left', maxAngle: 30 },
  TURN_HEAD_RIGHT: { promptText: 'Turn head right', minAngle: -30 },
  NOD: { promptText: 'Nod', minDiff: 1 },
  SMILE: { promptText: 'Smile', minProbability: 0.8 },
};

type DetectionActions = keyof typeof detections

const promptsText = {
  noFaceDetected: 'No face detected',
  performActions: 'Perform the following actions:',
  multipleFiles: 'There is more than one face',
};

const detectionsList: DetectionActions[] = [
  'BLINK',
  'TURN_HEAD_LEFT',
  'TURN_HEAD_RIGHT',
  'NOD',
  'SMILE',
];

const initialState = {
  faceDetected: false,
  multipleFacesDetected: false,
  promptText: promptsText.noFaceDetected,
  detectionsList,
  currentDetectionIndex: 0,
  progressFill: 0,
  processComplete: false,
};

export default function Liveness() {
  const {
    width,
    height,
  } = useWindowDimensions();
  const {
    hasPermission,
    requestPermission,
  } = useCameraPermission();
  const [state, dispatch] = useReducer(detectionReducer, initialState);
  const rect = useRef<View>(null);
  const camera = useRef<VisionCamera>(null);
  const rollAngles = useRef<number[]>([]);

  const navigation = useNavigation();

  const faceDetectionOptions = useRef<FaceDetectionOptions>({
    performanceMode: 'fast',
    classificationMode: 'all',
    windowWidth: width,
    windowHeight: height,
  }).current;

  const isFocused = useIsFocused();
  const appState = useAppState();
  const isCameraActive = (
    isFocused &&
    appState === 'active'
  );
  const cameraDevice = useCameraDevice('front');


  useEffect(() => {
    if (hasPermission) { return; }
    requestPermission();
  }, []);


  const drawFaceRect = (face: FaceDetection) => {
    rect.current?.setNativeProps({
      width: face.bounds.width,
      height: face.bounds.height,
      top: face.bounds.y,
      left: face.bounds.x,
    });
  };

  function handleFacesDetection(faces: Face[]) {
    if (faces.length > 1) {
      dispatch({ type: 'MULTIPLE_FACES_DETECTED', value: null });
      return;
    }

    if (faces.length === 0) {
      dispatch({ type: 'FACE_DETECTED', value: 'no' });
      return;
    }

    // console.log(JSON.stringify(faces[0], null, 2));

    const face: FaceDetection = faces[0];

    const midFaceOffsetY = face.bounds.height / 2;
    const midFaceOffsetX = face.bounds.width / 2;

    drawFaceRect(face);
    const faceMidYPoint = face.bounds.y + midFaceOffsetY;
    if (
      faceMidYPoint <= PREVIEW_MARGIN_TOP ||
      faceMidYPoint >= PREVIEW_SIZE + PREVIEW_MARGIN_TOP
    ) {
      dispatch({ type: 'FACE_DETECTED', value: 'no' });
      return;
    }

    const faceMidXPoint = face.bounds.x + midFaceOffsetX;
    if (
      faceMidXPoint <= windowWidth / 2 - PREVIEW_SIZE / 2 ||
      faceMidXPoint >= windowWidth / 2 + PREVIEW_SIZE / 2
    ) {
      dispatch({ type: 'FACE_DETECTED', value: 'no' });
      return;
    }

    if (!state.faceDetected) {
      dispatch({ type: 'FACE_DETECTED', value: 'yes' });
    }

    const detectionAction = state.detectionsList[state.currentDetectionIndex];

    switch (detectionAction) {
      case 'BLINK':
        const leftEyeClosed =
          face.leftEyeOpenProbability <= detections.BLINK.minProbability;
        const rightEyeClosed =
          face.rightEyeOpenProbability <= detections.BLINK.minProbability;
        if (leftEyeClosed && rightEyeClosed) {
          dispatch({ type: 'NEXT_DETECTION', value: null });
        }
        return;
      case 'NOD':
        rollAngles.current.push(face.rollAngle);
        if (rollAngles.current.length > 10) {
          rollAngles.current.shift();
        }
        if (rollAngles.current.length < 10) {
          return;
        }
        const rollAnglesExceptCurrent = [...rollAngles.current].splice(
          0,
          rollAngles.current.length - 1
        );
        const rollAnglesSum = rollAnglesExceptCurrent.reduce((prev, curr) => {
          return prev + Math.abs(curr);
        }, 0);
        const avgAngle = rollAnglesSum / rollAnglesExceptCurrent.length;
        const diff = Math.abs(avgAngle - Math.abs(face.rollAngle));
        if (diff >= detections.NOD.minDiff) {
          dispatch({ type: 'NEXT_DETECTION', value: null });
        }
        return;
      case 'TURN_HEAD_LEFT':
        // console.log('TURN_HEAD_LEFT ' + face.yawAngle);
        if (face.yawAngle >= detections.TURN_HEAD_LEFT.maxAngle) {
          dispatch({ type: 'NEXT_DETECTION', value: null });
        }
        return;
      case 'TURN_HEAD_RIGHT':
        // console.log('TURN_HEAD_RIGHT ' + face.yawAngle);
        if (face.yawAngle <= detections.TURN_HEAD_RIGHT.minAngle) {
          dispatch({ type: 'NEXT_DETECTION', value: null });
        }
        return;
      case 'SMILE':
        if (face.smilingProbability >= detections.SMILE.minProbability) {
          // console.log('SMILE', face.smilingProbability);
          dispatch({ type: 'NEXT_DETECTION', value: null });
        }
        return;
    }
  }


  useEffect(() => {
    if (state.processComplete) {
      Alert.alert('Liveness', 'Liveness check passed');
      // captureImage();
      setTimeout(() => {
        // delay so we can see progress fill aniamtion (500ms)
        navigation.goBack();
      }, 750);
    }
  }, [state.processComplete]);

  // const captureImage = async () => {
  //   if (camera.current) {
  //     const photo = await camera.current.takePictureAsync();
  //     camera(photo.uri);
  //   }
  // };
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  if (cameraDevice === undefined) {
    return <Text>Camera device is not available</Text>;
  }
  return (
    <View style={styles.container}>
      {/* {image ? <>
        <Text>Image Captured</Text>
        <View style={{ width: 200, height: 200, justifyContent: 'center', alignContent: 'center' }}>
          <Image source={{ uri: image }} style={{ width: 200, height: 200 }} />
        </View>
      </> : <> */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: '100%',
          height: PREVIEW_MARGIN_TOP,
          backgroundColor: 'white',
          zIndex: 10,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: PREVIEW_MARGIN_TOP,
          left: 0,
          width: (windowWidth - PREVIEW_SIZE) / 2,
          height: PREVIEW_SIZE,
          backgroundColor: 'white',
          zIndex: 10,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: PREVIEW_MARGIN_TOP,
          right: 0,
          width: (windowWidth - PREVIEW_SIZE) / 2 + 1,
          height: PREVIEW_SIZE,
          backgroundColor: 'white',
          zIndex: 10,
        }}
      />

      <Camera
        ref={camera}
        isActive={isCameraActive}
        style={StyleSheet.absoluteFill}
        device={cameraDevice}
        faceDetectionCallback={handleFacesDetection}
        faceDetectionOptions={faceDetectionOptions}
      />
      <CameraPreviewMask width={'100%'} style={styles.circularProgress} />
      <AnimatedCircularProgress
        style={styles.circularProgress}
        size={PREVIEW_SIZE}
        width={5}
        backgroundWidth={7}
        fill={state.progressFill}
        tintColor="#3485FF"
        backgroundColor="#e8e8e8"
      />

      <View
        ref={rect}
        style={{
          position: 'absolute',
          // borderWidth: 2,
          // borderColor: 'pink',
          zIndex: 10,
        }}
      />
      <View style={styles.promptContainer}>
        <Text style={styles.faceStatus}>
          {!state.faceDetected && !state.multipleFacesDetected && promptsText.noFaceDetected}
          {state.multipleFacesDetected && promptsText.multipleFiles}
        </Text>
        <Text style={styles.actionPrompt}>
          {state.faceDetected && promptsText.performActions}
        </Text>
        <Text style={styles.action}>
          {state.faceDetected &&
            detections[state.detectionsList[state.currentDetectionIndex]]
              .promptText}
        </Text>
      </View>
    </View>
  );
}



interface Action<T extends keyof Actions> {
  type: T
  value: Actions[T]
}
interface Actions {
  FACE_DETECTED: 'yes' | 'no';
  NEXT_DETECTION: null;
  MULTIPLE_FACES_DETECTED: null;
}

const detectionReducer = (
  state: typeof initialState,
  action: Action<keyof Actions>
): typeof initialState => {
  const numDetections = state.detectionsList.length;
  const newProgressFill =
    (100 / (numDetections + 1)) * (state.currentDetectionIndex + 1);

  switch (action.type) {
    case 'FACE_DETECTED':
      if (action.value === 'yes') {
        return { ...state, faceDetected: true, multipleFacesDetected: false, promptText: promptsText.performActions, progressFill: newProgressFill };
      } else {
        return initialState;
      }
    case 'NEXT_DETECTION':
      const nextIndex = state.currentDetectionIndex + 1;
      if (nextIndex === numDetections) {
        return { ...state, processComplete: true, progressFill: 100 };
      }
      return {
        ...state,
        currentDetectionIndex: nextIndex,
        progressFill: newProgressFill,
      };
    case 'MULTIPLE_FACES_DETECTED':
      return { ...state, faceDetected: false, multipleFacesDetected: true, promptText: promptsText.multipleFiles };
    default:
      throw new Error('Unexpected action type.');
  }
};

const CameraPreviewMask = (props: SvgProps) => (
  <Svg width={350} height={350} viewBox="0 0 300 300" fill="none" {...props}>
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M150 0H0v300h300V0H150zm0 0c82.843 0 150 67.157 150 150s-67.157 150-150 150S0 232.843 0 150 67.157 0 150 0z"
      fill="#fff"
    />
  </Svg>
);

const PREVIEW_MARGIN_TOP = 50;
const PREVIEW_SIZE = 350;

const styles = StyleSheet.create({
  actionPrompt: {
    fontSize: 20,
    textAlign: 'center',
    fontWeight: 'bold',
    color: 'black',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  promptContainer: {
    position: 'absolute',
    alignSelf: 'center',
    top: PREVIEW_MARGIN_TOP + PREVIEW_SIZE,
    height: '100%',
    width: '100%',
    backgroundColor: 'white',
  },
  faceStatus: {
    fontSize: 24,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: 'bold',
    color: 'black',
  },
  cameraPreview: {
    flex: 1,
  },
  circularProgress: {
    position: 'absolute',
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    top: PREVIEW_MARGIN_TOP,
    alignSelf: 'center',
  },
  action: {
    fontSize: 24,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: 'bold',
    color: 'black',
  },
});

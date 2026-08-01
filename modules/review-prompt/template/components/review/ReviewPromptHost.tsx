import React, {useEffect, useState} from 'react';
import {Platform} from 'react-native';
import {subscribeReviewSheet, type ReviewSheetRequest} from '../../lib/review';
import RateSheet from './RateSheet';

/**
 * The one place the rating gate can appear from (IncomingFileBridge pattern:
 * mounted once in App.tsx, renders nothing until asked). Lives at App level
 * so an ask fired from a screen's dismiss handler survives that screen
 * popping.
 *
 * iOS only, and not as an optimisation: the gate sheet is PROHIBITED on
 * Android (Play's In-App Review guidelines ban any question before the
 * rating flow), where lib/review calls the Play card directly and nothing
 * ever reaches this host.
 */
export default function ReviewPromptHost() {
  const [request, setRequest] = useState<ReviewSheetRequest | null>(null);
  useEffect(() => subscribeReviewSheet(setRequest), []);
  if (Platform.OS !== 'ios' || !request) {
    return null;
  }
  return <RateSheet visible trigger={request.trigger} onDismiss={() => setRequest(null)} />;
}

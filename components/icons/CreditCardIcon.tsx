import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface CreditCardIconProps {
  size?: number;
}

export function CreditCardIcon({ size = 24 }: CreditCardIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      {/* Corpo do cartão */}
      <Path
        d="M116.34 101.95H11.67c-4.2 0-7.63-3.43-7.63-7.63V33.68
           c0-4.2 3.43-7.63 7.63-7.63h104.67c4.2 0 7.63 3.43 7.63 7.63
           v60.64c0 4.2-3.43 7.63-7.63 7.63z"
        fill="#ffc107"
      />

      {/* Faixa magnética */}
      <Rect x="4.03" y="38.88" width="119.95" height="16.07" fill="#424242" />

      {/* Área branca (assinatura / números) */}
      <Path
        d="M114.2 74.14H13.87c-.98 0-1.79-.8-1.79-1.79v-8.41
           c0-.98.8-1.79 1.79-1.79H114.2c.98 0 1.79.8 1.79 1.79
           v8.41c-.01.98-.81 1.79-1.79 1.79z"
        fill="#ffffff"
      />

      {/* Linha decorativa ondulada */}
      <Path
        d="M23.98 70.49c.56-1.08.71-2.34 1.21-3.45
           c.5-1.11 1.59-2.14 2.79-1.95c1.11.18 1.8 1.29 2.21 2.33
           c.57 1.45.88 3 .92 4.56c.01.32-.01.67-.22.92
           c-.37.42-1.13.21-1.42-.27c-.29-.48-.22-1.09-.09-1.64
           c.62-2.55 2.62-4.72 5.11-5.54c.26-.09.53-.16.8-.11
           c.58.11.9.71 1.16 1.23c.61 1.19 1.35 2.32 2.2 3.35
           c.34.42.73.83 1.25.99c1.71.5 2.7-2.02 4.35-2.69
           c1.98-.8 3.91 1.29 6.01 1.68c3.07.57 4.7-1.82 7.39-2.43
           c.36-.08.75-.13 1.11-.03c.66.19 1.07.82 1.46 1.39
           c.91 1.34 2.21 2.66 3.83 2.67c1.03.01 1.98-.52 2.92-.97
           c3.33-1.59 7.26-2.25 10.74-1.03"
        fill="none"
        stroke="#424242"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
      />
    </Svg>
  );
}

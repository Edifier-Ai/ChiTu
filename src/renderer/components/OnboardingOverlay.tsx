import React, { useState } from 'react';
import './OnboardingOverlay.css';

interface OnboardingOverlayProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'cookies',
    title: 'Step 1: 配置 Cookie',
    description: '点击右上角"账号设置"，粘贴各平台的登录 Cookie，才能采集真实数据。',
  },
  {
    id: 'platform',
    title: 'Step 2: 选择平台',
    description: '选择要采集的平台，支持小红书、抖音、微博、B站多选。',
  },
  {
    id: 'filters',
    title: 'Step 3: 设置筛选条件',
    description: '输入搜索关键词，可设置时间范围和数量限制。',
  },
  {
    id: 'start',
    title: 'Step 4: 开始采集',
    description: '一切准备就绪，点击"开始爬取"按钮即可开始数据采集。',
  },
];

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ visible, onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!visible) return null;

  const step = STEPS[currentStep];

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="ct-onboarding-overlay">
      <div className="ct-onboarding-card">
        <div className="ct-onboarding-step-indicator">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`ct-onboarding-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}
            />
          ))}
        </div>
        <h3 className="ct-onboarding-title">{step.title}</h3>
        <p className="ct-onboarding-desc">{step.description}</p>
        <div className="ct-onboarding-actions">
          <button className="ct-onboarding-skip" onClick={onSkip}>
            跳过引导
          </button>
          <button className="ct-onboarding-next" onClick={handleNext}>
            {currentStep < STEPS.length - 1 ? '下一步' : '开始使用'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingOverlay;

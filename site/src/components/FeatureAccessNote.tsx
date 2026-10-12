import type { JSX } from 'react';

import './FeatureAccessNote.css';

export function FeatureAccessNote(): JSX.Element {
    return (
        <p className='feature-access-note'>
            每項功能都有各自的使用範圍，會依伺服器、頻道或身分組有所不同。如果有功能在你那邊無法使用，歡迎私訊我詢問。
        </p>
    );
}

package app.foam.ops;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        // Release system splash immediately; use the default exit (custom remove caused glitches).
        splashScreen.setKeepOnScreenCondition(() -> false);
        super.onCreate(savedInstanceState);
    }
}


import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  ProgressViewIOS,
  Modal,
  TouchableHighlight
} from 'react-native';
import {Vibration} from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import Prompt from 'react-native-prompt';
import ModalDropdown from 'react-native-modal-dropdown';
import Speech from 'react-native-speech';
import _ from 'lodash';

import {findDistance, processLocation, getRaceStatus} from '../utils/raceUtils.js';
import RaceProgress from './RaceProgress';
import RaceStatus from './RaceStatus';

import usain from '../../assets/presetChallenges/UsainBolt100m';
import walk from '../../assets/presetChallenges/worldRecordRaceWalk100m';
import james from '../../assets/presetChallenges/MarketSt3';
import nick from '../../assets/presetChallenges/MarketSt4';
import hare from '../../assets/presetChallenges/hare100m';


const presets = {
  'Usain Bolt': usain,
  worldRecordRaceWalk100m: walk,
  hare100m: hare
};

const myRuns = {
  'James Market St': james,
  'Nick Market St': nick,
};

let challenges;

const raceTypes = {
  Presets: presets,
  'My Runs': myRuns,
  Challenges: challenges,
  Live: 'Under Construction',
};

let opponent = walk;

export default class Race extends Component {

  constructor(props) {
    super(props);
    this.state = {
      history: [],
      raceStatus: null,
      promptVisible: false,
      raceName: null,
      raceDescription: null,
      progress: {
        playerDist: 0,
        opponentDist: 0,
        totalDist: opponent[opponent.length - 1].distanceTotal,
        playerWon: false,
        opponentWon: false
      },
      showSetupRace: true,
      raceSetup: {
        raceType: 'Presets',
        oppOptions: Object.keys(presets),
        opponent: walk,
        challenge: walk
      }
      // raceTabOn: false,
    };
    this.setTimeoutID = null;
    this.onLocationUpdate = this.onLocationUpdate.bind(this);
    this.beginGPSTracking = this.beginGPSTracking.bind(this);
  }

  componentWillMount() {
    this.beginGPSTracking();
    // console.warn('====== this.props at willMount = ', JSON.stringify(this.props.userId));
    this.getChallenges((responseJSON) => {
      // console.warn(JSON.stringify(responseJSON));
      let newChallenges = {};
      responseJSON.forEach((challenge) => {
        newChallenges[challenge.name] = challenge;
      });
      raceTypes['Challenges'] = newChallenges;
      // console.warn('Challenges loaded.');
    });
  }

  componentDidMount() {
    // Speech.supportedVoices()
    // .then(locales => {
    //   console.error(locales); // ["ar-SA", "en-ZA", "nl-BE", "en-AU", "th-TH", ...]
    // });
    // Speech.speak({
    //   text: 'Welcome to Race With Friends, a social running app with real time competitive elements',
    //   voice: 'en-AU'
    // });
    // this.getChallenges((responseJSON) => {
    //   console.warn(JSON.stringify(responseJSON));
    // });
  }

  beginGPSTracking() {
    // Now configure the plugin.
    BackgroundGeolocation.configure({
      // Geolocation Options
      desiredAccuracy: 0,
      locationUpdateInterval: 1000,
      fastestLocationUpdateInterval: 500,
      stationaryRadius: 1,
      disableElasticity: true,
      desiredOdometerAccuracy: 0,
      // Activity Recognition Options
      stopTimeout: 60, // Minutes
      disableMotionActivityUpdates: true,
      stopDetectionDelay: 60, // Minutes
      // HTTP / SQLite Persistence Options
      url: 'https://salty-stream-73177.herokuapp.com/',
      method: 'POST',
      autoSync: false, // POST each location immediately to server
      // Application config
      debug: false, // debug sounds & notifications
      logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
      stopOnTerminate: true, // Allow the background-service to continue tracking when user closes the app.
      startOnBoot: false, // Auto start tracking when device is powered-up.
      heartbeatInterval: 1,
      preventSuspend: true,
      // pausesLocationUpdatesAutomatically: false,
    }, function(state) {
      console.log('- BackgroundGeolocation is configured and ready: ', state.enabled);

      if (!state.enabled) {
        BackgroundGeolocation.start(function() {
          console.log('- Start success');
        });
      }
    });
  }

  onLocationUpdate(location) {
    clearInterval(this.setTimeoutID); //Clear previous setTimeout.

    let currentLoc = processLocation(location, this.state.history);
    let newRaceStatus = getRaceStatus(currentLoc, this.state.raceSetup.opponent, this.state.raceStatus);

    if (newRaceStatus.passedOpponent) {
      BackgroundGeolocation.playSound(1001);
    }
    if (newRaceStatus.distanceToOpponent > 0) {
      let pattern = [0];
      Vibration.vibrate(pattern);
    }

    this.state.history.push(currentLoc);
    this.setState({
      history: this.state.history,
      raceStatus: newRaceStatus,
      progress: {
        playerDist: currentLoc.distanceTotal,
        opponentDist: currentLoc.distanceTotal - newRaceStatus.distanceToOpponent,
        totalDist: opponent[opponent.length - 1].distanceTotal,
        playerWon: false,
        opponentWon: false,
      }
    });

    if (!newRaceStatus.challengeDone) {
      this.setTimeoutID = setTimeout((() => {
        BackgroundGeolocation.getCurrentPosition.call(this, (location, taskId) => {
          this.onLocationUpdate(location);
        });
      }).bind(this), 10000);
    } else { // challenge done
      BackgroundGeolocation.un('location', this.onLocationUpdate);
      BackgroundGeolocation.un('motionchange', this.onLocationUpdate);
      BackgroundGeolocation.un('heartbeat', this.onLocationUpdate);
    }
    console.log('~~~', JSON.stringify(location));
  }

  postRun() {
    let body = {
      userid: this.props.userId,
      created: (new Date()).toISOString(),
      name: this.state.raceName,
      description: 'testDescription',
      length: this.state.history[this.state.history.length - 1].distanceTotal,
      duration: this.state.history[this.state.history.length - 1].timeTotal,
      data: this.state.history,
    };

    // fetch('https://peaceful-dawn-56737.herokuapp.com/runs', {
    // fetch('https://requestb.in/1kvpibw1', {
    fetch('https://www.racewithfriends.tk:8000/users/' + this.props.userId + '/runs', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    }).then((response) => {
      return response.json();
    }).then((responseJSON) => {
      // console.warn('res.id =>', responseJSON.id);
    }).catch((error) => {
      console.error(error);
    });
  }

  onRecord() {
    // This handler fires whenever bgGeo receives a location update.
    BackgroundGeolocation.on('location', this.onLocationUpdate);
    // This handler fires when movement states changes (stationary->moving; moving->stationary)
    BackgroundGeolocation.on('motionchange', this.onLocationUpdate);
    BackgroundGeolocation.on('heartbeat', this.onLocationUpdate);
    BackgroundGeolocation.changePace(true);
  }

  onStopRecord() {
    clearInterval(this.setTimeoutID);

    // Remove BackgroundGeolocation listeners
    BackgroundGeolocation.un('location', this.onLocationUpdate);
    BackgroundGeolocation.un('motionchange', this.onLocationUpdate);
    BackgroundGeolocation.un('heartbeat', this.onLocationUpdate);
    this.setState({
      promptVisible: true
    });
  }

  clearHistory() {
    clearInterval(this.setTimeoutID);

    BackgroundGeolocation.un('location', this.onLocationUpdate);
    BackgroundGeolocation.un('motionchange', this.onLocationUpdate);
    BackgroundGeolocation.un('heartbeat', this.onLocationUpdate);

    this.setState({
      history: [],
      raceStatus: null,
      progress: {
        playerDist: 0,
        opponentDist: 0,
        totalDist: opponent[opponent.length - 1].distanceTotal,
        playerWon: false,
        opponentWon: false
      }
    });
  }

  showSetupRace(visible) {
    this.setState({
      showSetupRace: visible
    });
  }

  onPickRaceType(key, value) {
    const newState = {};
    newState.raceSetup = this.state.raceSetup;
    newState.raceSetup.raceType = value;
    // console.warn('challenges = ', challenges);
    newState.raceSetup.oppOptions = Object.keys(raceTypes[value]);
    this.setState(newState);
  }

  onPickOpponent(key, value) {
    const newState = {};
    newState.raceSetup = this.state.raceSetup;
    newState.raceSetup.opponent = raceTypes[this.state.raceSetup.raceType][value];
    newState.raceSetup.challenge = raceTypes[this.state.raceSetup.raceType][value];
    // console.error(JSON.stringify(newState));
    this.setState(newState, () => {
      if (newState.raceSetup.opponent.run_id) {
        let runId = newState.raceSetup.opponent.run_id;
        fetch('https://www.racewithfriends.tk:8000/runs/' + runId, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }).then((response) => {
          return response.json();
        }).then((responseJson) => {
          const nextState = {};
          nextState.raceSetup = this.state.raceSetup;
          nextState.raceSetup.opponent = responseJson.data;
          // console.error(JSON.stringify(nextState));
          this.setState(nextState, () => {
            // console.warn('Updated State!');
          });
        }).catch((error) => {
          console.error('onPickOpponent error: ', error);
        });
      }
    });
    // console.error('newState: ', newState.raceSetup.opponent.run_id);
  }

  getChallenges(callback) {
    // console.warn('userId=', this.props.userId);
    // let userId = this.props.userId;
    fetch('https://www.racewithfriends.tk:8000/challenges?opponent=' + this.props.userId, {
    // fetch('https://www.racewithfriends.tk:8000/challenges?opponent=10210021929398105', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    }).then((response) => {
      return response.json();
    }).then((responseJson) => {
      callback(responseJson);
    }).catch((error) => {
      console.error('getChallenges error: ', error);
    });
  }

  render() {
    const styles = StyleSheet.create({
      container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5FCFF',
      },
      welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
      },
      instructions: {
        textAlign: 'center',
        color: '#333333',
        marginBottom: 5,
      },
      buttons: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        flexDirection: 'row'
      }
    });

    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5FCFF',
        marginTop: 50
      }}>
        {!this.state.showSetupRace &&
          <View style={styles.container}>
            <RaceProgress progress={this.state.progress} />
            <RaceStatus
              status={this.state.raceStatus}
              playerName={'Player'}
              opponentName={'Opponent'}
            />
            <View style={styles.buttons}>
              <Button
                onPress={this.onRecord.bind(this)}
                title='Record'
                color='#dc143c' // Crimson
              />
              <Button
                onPress={this.onStopRecord.bind(this)}
                title="Stop"
                color='#00008b' // Blue
              />
              <Button
                onPress={this.clearHistory.bind(this)}
                title="Clear"
                color='#008000' // Green
              />
            </View>
          </View>}
        {this.state.showSetupRace &&
          <View style={styles.container}>
            <View style={styles.container}>
              <Text style={{fontSize: 26}}>Setup Race</Text>
              <Text>Race type:</Text>
              <ModalDropdown
                options={['Presets', 'My Runs', 'Challenges', 'Live']}
                onSelect={this.onPickRaceType.bind(this)}
                textStyle={{fontSize: 24}}
                defaultValue='Presets'
                // style={{marginBottom: 25}}
              />
              <Text>Opponent:</Text>
              <ModalDropdown
                options={this.state.raceSetup.oppOptions}
                onSelect={this.onPickOpponent.bind(this)}
                textStyle={{fontSize: 24}}
                defaultValue='worldRecordRaceWalk100m'
                // style={{marginBottom: 25}}
              />
              <View style={{
                flex: 1,
                justifyContent: 'flex-start',
                alignItems: 'center',
                backgroundColor: '#F5FCFF',
              }}>
                <Text>{`Name: ${this.state.raceSetup.challenge.name ? this.state.raceSetup.challenge.name : 'Preset'}`}</Text>
                <Text>{`Description: ${this.state.raceSetup.challenge.description ? this.state.raceSetup.challenge.description : 'Preset'}`}</Text>
                <Text>{`Total Distance: ${Math.round(this.state.raceSetup.challenge.distanceTotal ? this.state.raceSetup.challenge.distanceTotal : this.state.raceSetup.challenge[this.state.raceSetup.challenge.length - 1].distanceTotal)} meters`}</Text>
                <Text>{`Total Time: ${Math.round((this.state.raceSetup.challenge.timeTotal ? this.state.raceSetup.challenge.timeTotal : this.state.raceSetup.challenge[this.state.raceSetup.challenge.length - 1].timeTotal) / 1000)} seconds`}</Text>
                <Text>{`Message: ${this.state.raceSetup.challenge.message ? this.state.raceSetup.challenge.message : '--'}`}</Text>
                <TouchableHighlight onPress={() => {
                  this.showSetupRace(!this.state.showSetupRace);
                }}>
                  <Text>Done!</Text>
                </TouchableHighlight>
              </View>
            </View>
          </View>}
        {<Prompt
          title="Please name your race."
          placeholder="Race Name"
          visible={ this.state.promptVisible }
          onCancel={ () => this.setState({
            promptVisible: false,
          }) }
          onSubmit={ (value) => {
            // console.error(typeof value);
            this.setState({
              promptVisible: false,
              raceName: value
            }, () => this.postRun());
          }}
          submitText='Publish Run'
          cancelText={'Don\'t Publish'}
        />}
      </View>
    );
  }
}

// &&
//           <Prompt
//             title="Please give your race a description."
//             placeholder="Race Description"
//             defaultValue=""
//             visible={ this.state.promptVisible }
//             onCancel={ () => this.setState({
//               promptVisible: false,
//             }) }
//             onSubmit={ (value) => this.setState({
//               promptVisible: false,
//               raceDescription: value
//             }) }/>